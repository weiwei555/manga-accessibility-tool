import torch
from common import CommonOCR
from model_48px import Model48pxOCR

class MangaOCR(CommonOCR):
    def __init__(self):
        super().__init__()
        # Load the pretrained model for manga OCR
        self.model = Model48pxOCR()
        self.model.load_model("models/ocr_ar_48px.ckpt")

    def recognize(self, image_blob):
        # Process the image and extract text using the OCR model
        image = self._preprocess_image(image_blob)
        text = self.model.infer(image)
        return text

    def _preprocess_image(self, image_blob):
        # Add preprocessing logic for the image (e.g., resizing, grayscale)
        pass
