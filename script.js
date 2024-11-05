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

   // Generate image description with GPT-4
   const description = await generateDescriptionWithOpenAI(file);

   // Display the description
   const descriptionElement = document.createElement("p");
   descriptionElement.textContent = description;
   document.getElementById("description-text").appendChild(descriptionElement);
}

async function generateDescriptionWithOpenAI(imageBlob) {
   const apiUrl = "https://api.openai.com/v1/chat/completions";
   const apiKey = "sk-svcacct-H4_1JvJCXhzC6lYHC3AdXYWP_3XoiDD0FuK9toIXQdwo57rybxe_eoOQRgqtvT3BlbkFJes5iccb33RQcPKDFaPoBvQrPGtnWvXz3SZgfz7R1JEuWdaLNoiesHFUy7foQwA"; // Replace with your actual OpenAI API key

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
            model: "gpt-4",
            messages: [
               { role: "system", content: "You are an assistant that provides descriptions for images." },
               { role: "user", content: `Please describe this image: data:image/jpeg;base64,${base64Image}` }
            ]
         })
      });

      if (!response.ok) {
         const errorData = await response.json();
         console.error("Error response from API:", errorData);
         return "Error: Unable to generate description. Check your API key or permissions.";
      }

      const data = await response.json();
      console.log("API response:", data); // Log the response for debugging

      // Accessing the generated text from GPT-4 response
      return data.choices[0].message.content || "No description generated";
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
