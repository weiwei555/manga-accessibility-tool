document.getElementById("manga-upload").addEventListener("change", handleFileUpload);

async function handleFileUpload(event) {
  const files = event.target.files;
  document.getElementById("manga-page-container").innerHTML = ""; // Clear previous images
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

  // Add a heading for the panels
  const panelHeading = document.createElement("h2");
  panelHeading.textContent = "Page By Panels:";
  document.getElementById("manga-page-container").appendChild(panelHeading);

  try {
    // Segment the panels
    const panels = await segmentPanels(file);

    console.log("Number of panels found:", panels.length);

    let panelIndex = 0;

    for (const panelBlob of panels) {
      panelIndex++;

      // Create a container div for panel and description
      const panelContainer = document.createElement("div");
      panelContainer.classList.add("panel-container");

      // Display each panel
      const panelImg = document.createElement("img");
      panelImg.src = URL.createObjectURL(panelBlob);
      panelImg.alt = `Manga panel ${panelIndex}`;
      panelContainer.appendChild(panelImg);

      console.log("Panel image displayed");

      // Add panel number as secondary header
      const panelHeader = document.createElement("h3");
      panelHeader.textContent = `Panel ${panelIndex}:`;
      panelContainer.appendChild(panelHeader);

      // Generate image description with Hugging Face
      const description = await generateDescriptionWithHuggingFace(panelBlob);

      console.log("Description generated:", description);

      // Detect speech bubbles and extract text with Tesseract.js
      const ocrTexts = await extractTextFromSpeechBubbles(panelBlob);

      console.log("OCR texts extracted:", ocrTexts);

      // Combine the description and OCR texts with an extra newline
      const combinedDescription = `${description}\n\nDialog:\n${ocrTexts.join('\n')}`;

      // Display the description
      const descriptionElement = document.createElement("p");
      descriptionElement.textContent = combinedDescription;
      panelContainer.appendChild(descriptionElement);

      // Append the panel container to the manga-page-container
      document.getElementById("manga-page-container").appendChild(panelContainer);
    }
  } catch (error) {
    console.error("Error in handleImage:", error);
  }
}

async function generateDescriptionWithHuggingFace(imageBlob) {
  const apiUrl = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";
  const apiKey = "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"; // Replace with your actual API key

  // Convert the image blob to base64
  const base64Image = await blobToBase64(imageBlob);

  // Define the custom prompt
  const prompt = "Describe the image and transcribe the dialogue from the speech bubbles.";

  // Prepare the payload with the image and the custom prompt
  const payload = {
    inputs: {
      image: base64Image,
      prompt: prompt,
    },
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

    // Extract the generated text
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
    reader.onloadend = () => {
      // Remove the data URL prefix to get just the base64-encoded string
      const base64String = reader.result.split(",")[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function preprocessImage(image) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(image);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Convert to grayscale
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
      }
      ctx.putImageData(imageData, 0, 0);

      // Apply adaptive thresholding
      // Note: Implementing adaptive thresholding requires additional libraries like OpenCV.js.
      // For simplicity, we'll apply a basic binary threshold here.
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i];
        const threshold = 128; // You can adjust this value
        const value = brightness < threshold ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = value;
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(resolve, image.type);
    };

    img.onerror = reject;
  });
}

async function extractTextFromSpeechBubbles(panelBlob) {
  const speechBubbles = await detectSpeechBubbles(panelBlob);
  const ocrTexts = [];

  for (const bubbleCanvas of speechBubbles) {
    // Convert canvas to blob
    const blob = await new Promise((resolve) => bubbleCanvas.toBlob(resolve));

    // Preprocess the image
    const preprocessedBlob = await preprocessImage(blob);

    // Run OCR on the preprocessed image
    const { data: { text } } = await Tesseract.recognize(preprocessedBlob, "eng", {
      logger: (m) => console.log(m),
    });

    ocrTexts.push(text.trim());
  }

  return ocrTexts;
}


function groupWordsIntoLines(words) {
  const lines = [];
  let currentLine = [];
  let currentY = null;

  words.forEach(word => {
    const wordY = word.bbox.y0;

    if (currentY === null || Math.abs(wordY - currentY) < 10) {
      currentLine.push(word);
    } else {
      lines.push(currentLine);
      currentLine = [word];
    }

    currentY = wordY;
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}


function detectSpeechBubbles(panelImage) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(panelImage);

    img.onload = () => {
      // Create canvas and get image data
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

      // Apply median blur to reduce noise
      cv.medianBlur(gray, gray, 5);

      // Apply adaptive thresholding
      cv.adaptiveThreshold(
        gray,
        thresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        11,
        2
      );

      // Find contours
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const bubbles = [];
      const minArea = 500; // Minimum area to be considered a speech bubble
      const maxArea = (img.width * img.height) / 2; // Max area to filter out large regions

      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        const aspectRatio = rect.width / rect.height;
        const area = cv.contourArea(cnt);

        // Filter based on area and aspect ratio
        if (area > minArea && area < maxArea && aspectRatio > 0.5 && aspectRatio < 1.5) {
          // Potential speech bubble
          const bubbleCanvas = document.createElement("canvas");
          bubbleCanvas.width = rect.width;
          bubbleCanvas.height = rect.height;
          const bubbleCtx = bubbleCanvas.getContext("2d");
          bubbleCtx.drawImage(
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
          bubbles.push(bubbleCanvas);
        }
        cnt.delete();
      }

      // Clean up
      src.delete();
      gray.delete();
      thresh.delete();
      contours.delete();
      hierarchy.delete();

      resolve(bubbles);
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
        src.delete();
        gray.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();
        resolve([imageBlob]); // Return the whole image as one panel
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
        if (Math.abs(aCenterY - bCenterY) > 50) {
          // Adjust threshold as needed
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
        panelCanvas.toBlob(
          (blob) => {
            if (blob) {
              panels.push(blob);
            } else {
              console.error("Failed to convert canvas to blob");
            }
            processedPanels++;
            if (processedPanels === validContours.length) {
              // Clean up
              src.delete();
              gray.delete();
              thresh.delete();
              contours.delete();
              hierarchy.delete();
              resolve(panels);
            }
          },
          imageBlob.type
        );
      }
    };

    img.onerror = reject;
  });
}
