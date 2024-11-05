document.getElementById("manga-upload").addEventListener("change", handleFileUpload);

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

   // Generate image description with GPT-4 Vision
   const description = await generateDescriptionWithOpenAI(file);

   // Display the description
   const descriptionElement = document.createElement("p");
   descriptionElement.textContent = description;
   document.getElementById("description-text").appendChild(descriptionElement);
}

async function generateDescriptionWithOpenAI(imageBlob) {
   const apiUrl = "https://api.openai.com/v1/images/generations";  // Hypothetical endpoint; verify in OpenAI documentation
   const apiKey = "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"; // Replace with your actual OpenAI API key

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
            model: "gpt-4-vision",  // Hypothetical model name for GPT-4 with vision; verify in OpenAI API docs
            image: base64Image,
            instructions: "Provide a detailed description of this image."
         })
      });

      if (!response.ok) {
         const errorData = await response.json();
         console.error("Error response from API:", errorData);
         throw new Error(`HTTP error! Status: ${response.status} - ${errorData.error}`);
      }

      const data = await response.json();
      console.log("API response:", data);  // Log the response for debugging

      return data.description || "No description generated";  // Hypothetical key `description` in response; verify in API response format
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
