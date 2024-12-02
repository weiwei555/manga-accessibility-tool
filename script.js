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
async function extractTextFromSpeechBubbles(imageBlob) {
  const textRegions = await detectTextRegions(imageBlob);

  const img = new Image();
  img.src = URL.createObjectURL(imageBlob);
  await img.decode();

  const debugCanvas = document.createElement("canvas");
  debugCanvas.width = img.width;
  debugCanvas.height = img.height;
  const debugCtx = debugCanvas.getContext("2d");
  debugCtx.drawImage(img, 0, 0);

  const ocrResults = [];
  for (const region of textRegions) {
    const expandedRegion = expandBoundingBox(region, 10, img.width, img.height);

    // Draw debug rectangle for speech bubbles
    debugCtx.strokeStyle = "blue";
    debugCtx.lineWidth = 2;
    debugCtx.strokeRect(expandedRegion.x, expandedRegion.y, expandedRegion.width, expandedRegion.height);

    // Extract the region from the original image
    const canvas = document.createElement("canvas");
    canvas.width = expandedRegion.width;
    canvas.height = expandedRegion.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      img,
      expandedRegion.x,
      expandedRegion.y,
      expandedRegion.width,
      expandedRegion.height,
      0,
      0,
      expandedRegion.width,
      expandedRegion.height
    );

    // Convert to blob and run OCR
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const { data: { text } } = await Tesseract.recognize(blob, "eng", {
      logger: (m) => console.log(m),
    });

    ocrResults.push(text.trim());
  }

  // Append final debug canvas to DOM
  const debugTitle = document.createElement("h3");
  debugTitle.textContent = "Debug View: Speech Bubble Regions";
  document.getElementById("manga-page-container").appendChild(debugTitle);
  document.getElementById("manga-page-container").appendChild(debugCanvas);

  return ocrResults;
}


function drawDebugBoxes(canvas, boxes, color) {
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  boxes.forEach(box => {
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  });
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
function detectTextRegions(imageBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(imageBlob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const binary = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      // Apply adaptive thresholding
      cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

      // Apply edge detection
      cv.Canny(binary, edges, 50, 150);

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const textRegions = [];
      const debugCanvas = document.createElement("canvas");
      debugCanvas.width = canvas.width;
      debugCanvas.height = canvas.height;
      const debugCtx = debugCanvas.getContext("2d");
      debugCtx.drawImage(img, 0, 0);
      debugCtx.strokeStyle = "red";
      debugCtx.lineWidth = 2;

      for (let i = 0; i < contours.size(); i++) {
        const rect = cv.boundingRect(contours.get(i));
        const { x, y, width, height } = rect;

        // Filter based on size
        const minArea = 300; // Minimum area to consider as text
        const maxArea = (src.cols * src.rows) / 2; // Max area to avoid large regions
        const area = width * height;

        if (area >= minArea && area <= maxArea && width > 10 && height > 10) {
          textRegions.push({ x, y, width, height });
          debugCtx.strokeRect(x, y, width, height); // Draw debug rectangles
        }
      }

      // Append debug canvas to DOM
      const debugTitle = document.createElement("h3");
      debugTitle.textContent = "Debug View: Detected Text Regions";
      document.getElementById("manga-page-container").appendChild(debugTitle);
      document.getElementById("manga-page-container").appendChild(debugCanvas);

      // Clean up
      src.delete();
      gray.delete();
      binary.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();

      resolve(textRegions);
    };

    img.onerror = reject;
  });
}
function expandBoundingBox(box, expansionFactor, imgWidth, imgHeight) {
  const { x, y, width, height } = box;
  return {
    x: Math.max(0, x - expansionFactor),
    y: Math.max(0, y - expansionFactor),
    width: Math.min(imgWidth - x, width + 2 * expansionFactor),
    height: Math.min(imgHeight - y, height + 2 * expansionFactor),
  };
}

async function extractSpeechBubbles(imageBlob, textRegions) {
  const img = new Image();
  img.src = URL.createObjectURL(imageBlob);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const src = cv.imread(canvas);
      const bubbles = [];

      textRegions.forEach(region => {
        // Expand the bounding box to include the entire speech bubble
        const expansion = 10; // Adjust this value as needed
        const x = Math.max(region.x - expansion, 0);
        const y = Math.max(region.y - expansion, 0);
        const width = Math.min(region.width + 2 * expansion, src.cols - x);
        const height = Math.min(region.height + 2 * expansion, src.rows - y);

        // Extract the region of interest
        const rect = new cv.Rect(x, y, width, height);
        const roi = src.roi(rect);

        // Convert the ROI to a canvas
        const bubbleCanvas = document.createElement("canvas");
        bubbleCanvas.width = roi.cols;
        bubbleCanvas.height = roi.rows;
        cv.imshow(bubbleCanvas, roi);

        bubbles.push(bubbleCanvas);

        roi.delete();
      });

      src.delete();
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
