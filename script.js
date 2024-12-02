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

function preprocessImage(imageBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(imageBlob);
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
        data[i] = avg; // Red
        data[i + 1] = avg; // Green
        data[i + 2] = avg; // Blue
      }
      ctx.putImageData(imageData, 0, 0);

      // Apply a basic binary threshold
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i];
        const threshold = 128; // Threshold value (adjustable)
        const value = brightness < threshold ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = value; // Apply binary threshold
      }
      ctx.putImageData(imageData, 0, 0);

      // Convert canvas back to blob
      canvas.toBlob(resolve, imageBlob.type);
    };
    img.onerror = reject;
  });
}

async function generateDescriptionWithHuggingFace(imageBlob) {
  const apiUrl = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";
  const apiKey = "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"; // Replace with your actual API key

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

async function extractTextFromSpeechBubbles(panelBlob) {
  const speechBubbles = await detectSpeechBubbles(panelBlob);
  const ocrTexts = [];

  for (const bubbleCanvas of speechBubbles) {
    // Convert bubbleCanvas to a blob for preprocessing
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

    if (currentY === null || Math.abs(wordY - currentY) < 10) { // Adjust line proximity threshold
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


async function detectSpeechBubbles(panelBlob) {
  return new Promise(async (resolve, reject) => {
    try {
      // Load the image
      const img = new Image();
      img.src = URL.createObjectURL(panelBlob);

      img.onload = async () => {
        // Create a canvas for the original image
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        // Run OCR to detect text zones
        const { data: { words } } = await Tesseract.recognize(canvas, "eng", {
          logger: (m) => console.log(m),
        });

        // Convert detected words to bounding boxes
        const textZones = words.map(word => ({
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        }));

        // Prepare OpenCV.js structures
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const edges = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        // Apply Canny edge detection to detect edges
        cv.Canny(gray, edges, 50, 150);

        // Find contours
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // Debug canvas to show detected bubbles
        const debugCanvas = document.createElement("canvas");
        debugCanvas.width = canvas.width;
        debugCanvas.height = canvas.height;
        const debugCtx = debugCanvas.getContext("2d");
        debugCtx.drawImage(img, 0, 0);
        debugCtx.strokeStyle = "red";
        debugCtx.lineWidth = 2;

        const bubbles = [];

        // For each detected text zone, find the nearest contour edges
        textZones.forEach((zone) => {
          let closestContour = null;
          let minDistance = Infinity;

          for (let i = 0; i < contours.size(); i++) {
            const cnt = contours.get(i);
            const rect = cv.boundingRect(cnt);

            // Calculate distance from text zone to contour
            const dx = Math.abs(rect.x - zone.x);
            const dy = Math.abs(rect.y - zone.y);
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Keep the closest contour
            if (distance < minDistance) {
              minDistance = distance;
              closestContour = rect;
            }
          }

          // Expand the text zone to include the closest contour
          if (closestContour) {
            const bubble = {
              x: Math.min(zone.x, closestContour.x),
              y: Math.min(zone.y, closestContour.y),
              width: Math.max(zone.x + zone.width, closestContour.x + closestContour.width) - Math.min(zone.x, closestContour.x),
              height: Math.max(zone.y + zone.height, closestContour.y + closestContour.height) - Math.min(zone.y, closestContour.y),
            };

            // Add bubble to results and draw on debug canvas
            bubbles.push(bubble);
            debugCtx.strokeRect(bubble.x, bubble.y, bubble.width, bubble.height);
          }
        });

        // Append debug canvas to DOM
        const debugTitle = document.createElement("h3");
        debugTitle.textContent = "Detected Speech Bubbles (Debug View):";
        document.getElementById("manga-page-container").appendChild(debugTitle);
        document.getElementById("manga-page-container").appendChild(debugCanvas);

        // Clean up OpenCV resources
        src.delete();
        gray.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();

        resolve(bubbles);
      };

      img.onerror = reject;
    } catch (error) {
      console.error("Error in detectSpeechBubbles:", error);
      reject(error);
    }
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
