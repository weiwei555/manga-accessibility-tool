document.getElementById("manga-upload").addEventListener("change", handleFileUpload);

async function extractTextFromImage(imageBlob) {
   const result = await Tesseract.recognize(
      imageBlob,
      'eng',  // Language setting; adjust if your manga includes other languages
      { logger: m => console.log(m) }  // Optional: logs progress
   );
   return result.data.text;
}


function setMode(mode) {
   const descriptionText = document.getElementById("description-text");
   if (mode === 'panel') {
      descriptionText.innerHTML = "Panel-by-Panel mode selected.";
      // Add code here to show panel descriptions as needed.
   } else if (mode === 'summary') {
      descriptionText.innerHTML = "Page Summary mode selected.";
      // Add code here to show page summary descriptions as needed.
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

   const description = await generateDescription(file);
   const descriptionElement = document.createElement("p");
   descriptionElement.textContent = description;
   document.getElementById("description-text").appendChild(descriptionElement);
}

async function generateDescription(imageBlob) {
   const apiUrl = "https://api-inference.huggingface.co/models/nlpconnect/vit-gpt2-image-captioning";
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

// Helper function to convert Blob to base64
function blobToBase64(blob) {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
   });
}
