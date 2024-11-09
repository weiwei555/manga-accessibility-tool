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
   console.log("Processing image file:", file.name);

   // Display the original image
   const img = document.createElement("img");
   img.src = URL.createObjectURL(file);
   img.alt = "Manga page";
   document.getElementById("manga-page-container").appendChild(img);

   console.log("Original image displayed");

   try {
      // Segment the panels
      const panels = await segmentPanels(file);

      console.log("Number of panels found:", panels.length);

      for (const panelBlob of panels) {
         // Display each panel
         const panelImg = document.createElement("img");
         panelImg.src = URL.createObjectURL(panelBlob);
         panelImg.alt = "Manga panel";
         document.getElementById("manga-page-container").appendChild(panelImg);

         console.log("Panel image displayed");

         // Generate image description with Hugging Face
         const description = await generateDescriptionWithHuggingFace(panelBlob);

         console.log("Description generated:", description);

         // Preprocess and extract text with Tesseract.js
         const ocrText = await extractTextWithOCR(panelBlob);

         console.log("OCR text extracted:", ocrText);

         // Combine the description and OCR text
         const combinedDescription = `${description}\nDialog: ${ocrText}`;

         // Display the description
         const descriptionElement = document.createElement("p");
         descriptionElement.textContent = combinedDescription;
         document.getElementById("description-text").appendChild(descriptionElement);
      }
   } catch (error) {
      console.error("Error in handleImage:", error);
   }
}

async function generateDescriptionWithHuggingFace(imageBlob) {
   const apiUrl = "https://api-inference.huggingface.co/models/microsoft/trocr-base-handwritten";
   const apiKey = "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"; // Replace with your Hugging Face API key

   // Get the base64-encoded image without the data URL prefix
   const base64Image = await blobToBase64(imageBlob);

   const payload = {
      inputs: base64Image,
      options: {
         wait_for_model: true,
      },
   };

   try {
      const response = await fetch(apiUrl, {
         method: "POST",
         headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
         },
         body: JSON.stringify(payload),
      });

      if (!response.ok) {
         const errorData = await response.text();
         console.error("Error response from API:", errorData);
         return "Error: Unable to generate description.";
      }

      const data = await response.json();
      console.log("API response:", data);

      // Extract the recognized text
      return data[0]?.text || "No text recognized";
   } catch (error) {
      console.error("Error generating description:", error);
      return "Failed to generate description. Please try again.";
   }
}


// Helper function to convert Blob to base64
function blobToBase64(blob) {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
         // Remove the data URL prefix to get just the base64-encoded string
         const base64String = reader.result.split(',')[1];
         resolve(base64String);
      };
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
         let validContours = [];

         // First, collect valid contours
         for (let i = 0; i < totalContours; ++i) {
            const cnt = contours.get(i);
            const rect = cv.boundingRect(cnt);
            // Filter out small areas
            if (rect.width * rect.height >= 10000) {
               validContours.push({ contour: cnt, rect: rect });
            } else {
               cnt.delete(); // Delete small contours
            }
         }

         if (validContours.length === 0) {
            // No valid panels found
            // Clean up
            src.delete(); gray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
            resolve(panels);
            return;
         }

         // Sort the contours from top-left to bottom-right
         validContours.sort((a, b) => {
            // Calculate the center of each rectangle
            const aCenterX = a.rect.x + a.rect.width / 2;
            const aCenterY = a.rect.y + a.rect.height / 2;
            const bCenterX = b.rect.x + b.rect.width / 2;
            const bCenterY = b.rect.y + b.rect.height / 2;

            // First sort by Y (rows), then by X (columns)
            if (Math.abs(aCenterY - bCenterY) > 50) { // Adjust threshold as needed
               return aCenterY - bCenterY;
            } else {
               return aCenterX - bCenterX;
            }
         });

         let processedPanels = 0;

         // Now process the sorted panels
         for (let i = 0; i < validContours.length; ++i) {
            const cnt = validContours[i].contour;
            const rect = validContours[i].rect;

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
               if (processedPanels === validContours.length) {
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
