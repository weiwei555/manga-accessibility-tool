from abc import ABC, abstractmethod

class CommonOCR(ABC):
    def __init__(self):
        pass

    @abstractmethod
    def recognize(self, image_blob):
        pass
