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
   const img = document.createElement("img");
   img.src = URL.createObjectURL(file);
   img.alt = "Manga page";
   document.getElementById("manga-page-container").appendChild(img);

   // Generate image description with Hugging Face
   const description = await generateDescriptionWithHuggingFace(file);

   // Preprocess and extract text with Tesseract.js
   const ocrText = await extractTextWithOCR(file);

   // Combine the description and OCR text
   const combinedDescription = `${description}\nDialog: ${ocrText}`;

   // Display the description
   const descriptionElement = document.createElement("p");
   descriptionElement.textContent = combinedDescription;
   document.getElementById("description-text").appendChild(descriptionElement);
}

async function generateDescriptionWithHuggingFace(imageBlob) {
   const apiUrl = "https://api-inference.huggingface.co/models/nlpconnect/vit-gpt2-image-captioning";
   const apiKey = "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"; // Replace this with your Hugging Face API key

   // Convert imageBlob to base64
   const base64Image = await blobToBase64(imageBlob);

   try {
      const response = await fetch(apiUrl, {
         method: "POST",
         headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
         },
         body: JSON.stringify({
            inputs: base64Image
         })
      });

      if (!response.ok) {
         const errorData = await response.json();
         console.error("Error response from API:", errorData);
         return "Error: Unable to generate description. Check your API key or permissions.";
      }

      const data = await response.json();
      console.log("API response:", data); // Log the response for debugging

      return data[0].generated_text || "No description generated";
   } catch (error) {
      console.error("Error generating description:", error);
      return "Failed to generate description. Please try again.";
   }
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
         const scaleFactor = 2; // Increase resolution by scaling
         canvas.width = img.width * scaleFactor;
         canvas.height = img.height * scaleFactor;
         const ctx = canvas.getContext("2d");

         // Draw the scaled image on the canvas
         ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

         // Get image data for processing
         const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
         const data = imageData.data;

         // Binarize the image by setting pixels to black or white
         for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            // Set pixel to black or white based on threshold
            const threshold = 128;
            if (avg < threshold) {
               data[i] = 0; // R
               data[i + 1] = 0; // G
               data[i + 2] = 0; // B
            } else {
               data[i] = 255; // R
               data[i + 1] = 255; // G
               data[i + 2] = 255; // B
            }
         }
         ctx.putImageData(imageData, 0, 0);

         // Convert canvas to a blob and resolve
         canvas.toBlob(resolve);
      };

      img.onerror = reject;
   });
}

// Helper function to convert Blob to base64
function blobToBase64(blob) {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
   });
}
