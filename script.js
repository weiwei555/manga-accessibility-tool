document.getElementById("manga-upload").addEventListener("change", handleFileUpload);

function setMode(mode) {
   const descriptionText = document.getElementById("description-text");

   if (mode === "panel") {
      descriptionText.innerHTML = "Panel-by-Panel mode selected.";
   } else if (mode === "summary") {
      descriptionText.innerHTML = "Page Summary mode selected.";
   }
}

async function handleFileUpload(event) {
   // Wait for OpenCV.js to be initialized
   if (typeof cv === 'undefined' || !cv['onRuntimeInitialized']) {
      await new Promise((resolve) => {
         cv['onRuntimeInitialized'] = resolve;
      });
   }

   const files = event.target.files;
   for (let file of files) {
      if (file.type.startsWith("image/")) {
         await handleImage(file);
      } else {
         alert("Please upload image files only.");
      }
   }
}

async function handleImage(file) {
   // Display the original image
   const img = document.createElement("img");
   img.src = URL.createObjectURL(file);
   img.alt = "Manga page";
   document.getElementById("manga-page-container").appendChild(img);

   // Segment the panels
   const panels = await segmentPanels(file);

   for (const panelBlob of panels) {
      // Display each panel
      const panelImg = document.createElement("img");
      panelImg.src = URL.createObjectURL(panelBlob);
      panelImg.alt = "Manga panel";
      document.getElementById("manga-page-container").appendChild(panelImg);

      // Generate image description with Hugging Face
      const description = await generateDescriptionWithHuggingFace(panelBlob);

      // Preprocess and extract text with Tesseract.js
      const ocrText = await extractTextWithOCR(panelBlob);

      // Combine the description and OCR text
      const combinedDescription = `${description}\nDialog: ${ocrText}`;

      // Display the description
      const descriptionElement = document.createElement("p");
      descriptionElement.textContent = combinedDescription;
      document.getElementById("description-text").appendChild(descriptionElement);
   }
}

async function generateDescriptionWithHuggingFace(imageBlob) {
   const apiUrl = "https://api-inference.huggingface.co/models/Salesforce/blip2-flan-t5-xl";
   const apiKey = "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"; // Replace with your Hugging Face API key

   const base64Image = await blobToBase64(imageBlob);

   const payload = {
      inputs: {
         image: base64Image,
         text: "Describe in detail the manga panel, including the characters' appearances, actions, emotions, and any visible text."
      },
      options: {
         wait_for_model: true
      }
   };

   try {
      const response = await fetch(apiUrl, {
         method: "POST",
         headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
         },
         body: JSON.stringify(payload)
      });

      if (!response.ok) {
         const errorData = await response.text();
         console.error("Error response from API:", errorData);
         return "Error: Unable to generate description.";
      }

      const data = await response.json();
      console.log("API response:", data);

      return data.generated_text || "No description generated";
   } catch (error) {
      console.error("Error generating description:", error);
      return "Failed to generate description. Please try again.";
   }
}

// Helper function to convert Blob to base64
function blobToBase64(blob) {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
   });
}

async function extractTextWithOCR(imageBlob) {
   // Pre-process image using a canvas for better OCR results
   const processedImage = await createPreprocessedImage(imageBlob);

   const { data: { text } } = await Tesseract.recognize(processedImage, 'eng', {
      logger: (m) => console.log(m),
   });
   return text;
}

function createPreprocessedImage(imageBlob) {
   return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(imageBlob);

      img.onload = () => {
         const canvas = document.createElement("canvas");
         const scaleFactor = 2;
         canvas.width = img.width * scaleFactor;
         canvas.height = img.height * scaleFactor;
         const ctx = canvas.getContext("2d");

         ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

         // Convert to grayscale and apply thresholding
         let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
         let data = imageData.data;

         for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = data[i + 1] = data[i + 2] = avg > 180 ? 255 : 0;
         }

         ctx.putImageData(imageData, 0, 0);

         canvas.toBlob((blob) => {
            resolve(blob);
         }, imageBlob.type);
      };

      img.onerror = reject;
   });
}

function segmentPanels(imageBlob) {
   return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(imageBlob);

      img.onload = () => {
         const canvas = document.createElement("canvas");
         canvas.width = img.width;
         canvas.height = img.height;
         const ctx = canvas.getContext("2d");
         ctx.drawImage(img, 0, 0);

         // Convert canvas to OpenCV Mat
         let src = cv.imread(canvas);
         let gray = new cv.Mat();
         let thresh = new cv.Mat();
         let contours = new cv.MatVector();
         let hierarchy = new cv.Mat();

         // Convert to grayscale
         cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

         // Apply binary threshold
         cv.threshold(gray, thresh, 200, 255, cv.THRESH_BINARY_INV);

         // Find contours
         cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

         const panels = [];
         const totalContours = contours.size();
         let validPanels = 0;
         let processedPanels = 0;

         // First, count the number of valid panels
         for (let i = 0; i < totalContours; ++i) {
            const cnt = contours.get(i);
            const rect = cv.boundingRect(cnt);
            // Filter out small areas
            if (rect.width * rect.height >= 10000) {
               validPanels++;
            }
            cnt.delete(); // Delete the contour after use
         }

         if (validPanels === 0) {
            // No valid panels found
            // Clean up
            src.delete(); gray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
            resolve(panels);
            return;
         }

         // Now process the valid panels
         for (let i = 0; i < totalContours; ++i) {
            const cnt = contours.get(i);
            const rect = cv.boundingRect(cnt);

            // Filter out small areas
            if (rect.width * rect.height < 10000) {
               cnt.delete();
               continue;
            }

            // Extract panel image
            const panelCanvas = document.createElement("canvas");
            panelCanvas.width = rect.width;
            panelCanvas.height = rect.height;
            const panelCtx = panelCanvas.getContext("2d");
            panelCtx.drawImage(
               img,
               rect.x,
               rect.y,
               rect.width,
               rect.height,
               0,
               0,
               rect.width,
               rect.height
            );

            cnt.delete(); // Delete the contour after use

            // Convert panel canvas to blob
            panelCanvas.toBlob((blob) => {
               panels.push(blob);
               processedPanels++;
               if (processedPanels === validPanels) {
                  // Clean up
                  src.delete(); gray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
                  resolve(panels);
               }
            }, imageBlob.type);
         }
      };

      img.onerror = reject;
   });
}
