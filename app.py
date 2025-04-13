from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import io
from collections import Counter
from PIL import Image
from ultralytics import YOLO
import os

# App Configuration
app = Flask(__name__)
CORS(app)

# Model paths
MODELS = {
    'yolov8s.pt': './model/yolov8s.pt',
    'yolov9m.pt': './model/yolov9m.pt'
}

# Load models on demand
loaded_models = {}

def get_model(model_name):
    """Load model if not already loaded"""
    if model_name not in loaded_models:
        if model_name in MODELS and os.path.exists(MODELS[model_name]):
            loaded_models[model_name] = YOLO(MODELS[model_name])
        else:
            raise ValueError(f"Model {model_name} not found")
    return loaded_models[model_name]

def decode_base64_image(base64_string):
    """Base64 image string ko decode karna"""
    # Remove data URL prefix if present
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    image_data = base64.b64decode(base64_string)
    image = Image.open(io.BytesIO(image_data))
    return np.array(image)

@app.route('/detect', methods=['POST'])
def detect_objects():
    try:
        # Image receive karna
        image_base64 = request.json.get('image', '')
        
        # Get selected model
        model_name = request.json.get('model', 'yolov9m.pt')
        model = get_model(model_name)
        
        # Get confidence threshold
        confidence = request.json.get('confidence', 0.25)
        
        # Image decode karna
        image = decode_base64_image(image_base64)
        
        # Object detection
        results = model(image, conf=confidence)
        
        # Detected objects ko process karna
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                # Bounding box coordinates
                x1, y1, x2, y2 = box.xyxy[0]
                
                # Confidence aur class
                conf = box.conf[0]
                cls = int(box.cls[0])
                class_name = model.names[cls]
                
                # Detection object banana
                detection = {
                    'bbox': [float(x1), float(y1), float(x2-x1), float(y2-y1)],
                    'class': class_name,
                    'confidence': float(conf)
                }
                detections.append(detection)
        
        # Object grouping
        object_counts = Counter(det['class'] for det in detections)
        grouped_objects = [
            {'class': obj, 'count': count} 
            for obj, count in object_counts.items()
        ]
        
        return jsonify({
            'detections': detections,
            'grouped_objects': grouped_objects,
            'model_used': model_name
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/available-models', methods=['GET'])
def get_available_models():
    """Available object detection models"""
    return jsonify({
        'models': [
            {'name': 'yolov8s.pt', 'type': 'Object Detection', 'description': 'YOLOv8s (Fastest)'},
            {'name': 'yolov9m.pt', 'type': 'Object Detection', 'description': 'YOLOv9m (Highest Accuracy)'},
        ]
    })

@app.route('/detect-multiple', methods=['POST'])
def detect_multiple_objects():
    """Multiple images ke liye detection support"""
    try:
        images_base64 = request.json.get('images', [])
        
        # Get selected model
        model_name = request.json.get('model', 'yolov9m.pt')
        model = get_model(model_name)
        
        # Get confidence threshold
        confidence = request.json.get('confidence', 0.25)
        
        all_detections = []
        
        for image_base64 in images_base64:
            # Image decode karna
            image = decode_base64_image(image_base64)
            
            # Object detection
            results = model(image, conf=confidence)
            
            # Detected objects ko process karna
            image_detections = []
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    # Bounding box coordinates
                    x1, y1, x2, y2 = box.xyxy[0]
                    
                    # Confidence aur class
                    conf = box.conf[0]
                    cls = int(box.cls[0])
                    class_name = model.names[cls]
                    
                    # Detection object banana
                    detection = {
                        'bbox': [float(x1), float(y1), float(x2-x1), float(y2-y1)],
                        'class': class_name,
                        'confidence': float(conf)
                    }
                    image_detections.append(detection)
            
            all_detections.append(image_detections)
        
        return jsonify({
            'detections': all_detections,
            'model_used': model_name
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)