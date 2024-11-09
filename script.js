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

   try {
      const response = await fetch(apiUrl, {
         method: "POST",
         headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": imageBlob.type  // e.g., 'image/png' or 'image/jpeg'
         },
         body: imageBlob
      });

      if (!response.ok) {
         const errorData = await response.text();
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

         // Convert the image to grayscale
         const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
         const data = imageData.data;

         // Grayscale conversion
         for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = data[i + 1] = data[i + 2] = avg;
         }

         // Apply adaptive threshold
         for (let i = 0; i < data.length; i += 4) {
            const value = data[i];
            data[i] = data[i + 1] = data[i + 2] = value > 200 ? 255 : 0;
         }

         ctx.putImageData(imageData, 0, 0);

         // Convert canvas to a blob and resolve
         canvas.toBlob((blob) => {
            resolve(blob);
         }, imageBlob.type);
      };

      img.onerror = reject;
   });
}
