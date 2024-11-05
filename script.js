document.getElementById("manga-upload").addEventListener("change", handleFileUpload);

function setMode(mode) {
   const descriptionText = document.getElementById("description-text");
   if (mode === 'panel') {
      descriptionText.innerHTML = "Panel-by-Panel mode selected.";
   } else if (mode === 'summary') {
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

   try {
      // Perform OCR to extract text from the image
      const ocrText = await extractTextFromImage(file);
      
      // Generate image caption from Hugging Face model
      const caption = await generateDescription(file);

      // Combine OCR text and caption into a single description
      const description = ocrText.trim() 
         ? `Text in image: "${ocrText.trim()}" | Generated caption: "${caption}"`
         : `OCR failed to read text accurately. Generated caption: "${caption}"`;

      const descriptionElement = document.createElement("p");
      descriptionElement.textContent = description;
      document.getElementById("description-text").appendChild(descriptionElement);
   } catch (error) {
      console.error("Error handling image:", error);
      const descriptionElement = document.createElement("p");
      descriptionElement.textContent = "Failed to generate description. Please try a clearer image.";
      document.getElementById("description-text").appendChild(descriptionElement);
   }
}

// OCR Function with Improved Logging
async function extractTextFromImage(imageBlob) {
   try {
      const result = await Tesseract.recognize(
         imageBlob,
         'eng',  // Adjust language as needed
         { logger: m => console.log(m) }
      );
      return result.data.text;
   } catch (error) {
      console.error("OCR error:", error);
      return "";  // Return an empty string if OCR fails
   }
}

async function generateDescription(imageBlob) {
   const apiUrl = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base";
   const apiKey = "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"; // Replace with your actual API key

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
         throw new Error(`HTTP error! Status: ${response.status} - ${errorData.error}`);
      }
      
      const data = await response.json();
      console.log("API response:", data);  // Log the response for debugging

      return data[0]?.generated_text || "No description generated";
   } catch (error) {
      console.error("Error generating description:", error);
      return "Failed to generate description. Please try again.";
   }
}

function blobToBase64(blob) {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
   });
}
