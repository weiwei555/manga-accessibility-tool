document.getElementById("manga-upload").addEventListener("change", handleFileUpload);

async function handleFileUpload(event) {
   const files = event.target.files;
   for (let file of files) {
      if (file.type === "application/pdf") {
         // Handle PDF with PDF.js
         await handlePDF(file);
      } else if (file.type.startsWith("image/")) {
         await handleImage(file);
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
   const apiKey = "YOUR_HUGGING_FACE_API_KEY"; // Replace with your Hugging Face API key

   const formData = new FormData();
   formData.append("file", imageBlob);

   const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData
   });
   
   const data = await response.json();
   return data[0]?.generated_text || "No description generated";
}
