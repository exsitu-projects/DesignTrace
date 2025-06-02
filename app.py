import os
import random
import torch
import numpy as np
from PIL import Image, ImageOps
import base64
import io
from flask import Flask, request, jsonify, send_from_directory
from MagicQuill import folder_paths
from MagicQuill.llava_new import LLaVAModel
from MagicQuill.scribble_color_edit import ScribbleColorEditModel
import time
from flask_cors import CORS
import uuid
import traceback
from torchvision import transforms
app = Flask(__name__)
CORS(app, supports_credentials=True)
AUTO_SAVE = False
RES = 512

llavaModel = LLaVAModel()
scribbleColorEditModel = ScribbleColorEditModel()


def tensor_to_base64(tensor):
    tensor = tensor.squeeze(0) * 255.
    pil_image = Image.fromarray(tensor.cpu().byte().numpy())
    buffered = io.BytesIO()
    pil_image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return img_str


def read_base64_image(base64_image):
    if base64_image.startswith("data:image/png;base64,"):
        base64_image = base64_image.split(",")[1]
    elif base64_image.startswith("data:image/jpeg;base64,"):
        base64_image = base64_image.split(",")[1]
    elif base64_image.startswith("data:image/webp;base64,"):
        base64_image = base64_image.split(",")[1]
    else:
        raise ValueError("Unsupported image format.")
    image_data = base64.b64decode(base64_image)
    image = Image.open(io.BytesIO(image_data))
    image = ImageOps.exif_transpose(image)
    return image


def create_alpha_mask(base64_image):
    """Create an alpha mask from the alpha channel of an image."""
    image = read_base64_image(base64_image)
    mask = torch.zeros((1, image.height, image.width), dtype=torch.float32, device="cpu")
    if 'A' in image.getbands():
        alpha_channel = np.array(image.getchannel('A')).astype(np.float32) / 255.0
        mask[0] = 1.0 - torch.from_numpy(alpha_channel)
    return mask


def load_and_preprocess_image(base64_image, convert_to='RGB', has_alpha=False):
    """Load and preprocess a base64 image."""
    image = read_base64_image(base64_image)
    image = image.convert(convert_to)
    image_array = np.array(image).astype(np.float32) / 255.0
    image_tensor = torch.from_numpy(image_array)[None,]
    return image_tensor


def load_and_resize_image(base64_image, convert_to='RGB', max_size=512):
    """Load and preprocess a base64 image, resize if necessary."""
    image = read_base64_image(base64_image)
    image = image.convert(convert_to)
    width, height = image.size
    scaling_factor = max_size / min(width, height)
    new_size = (int(width * scaling_factor), int(height * scaling_factor))
    image = image.resize(new_size, Image.LANCZOS)
    image_array = np.array(image).astype(np.float32) / 255.0
    image_tensor = torch.from_numpy(image_array)[None,]
    return image_tensor


def prepare_images_and_masks(total_mask, original_image, add_color_image, add_edge_image, remove_edge_image):
    total_mask = create_alpha_mask(total_mask)
    original_image_tensor = load_and_preprocess_image(original_image)
    if add_color_image:
        add_color_image_tensor = load_and_preprocess_image(add_color_image)
    else:
        add_color_image_tensor = original_image_tensor

    add_edge_mask = create_alpha_mask(add_edge_image) if add_edge_image else torch.zeros_like(total_mask)
    remove_edge_mask = create_alpha_mask(remove_edge_image) if remove_edge_image else torch.zeros_like(total_mask)
    return add_color_image_tensor, original_image_tensor, total_mask, add_edge_mask, remove_edge_mask


def guess(original_image_tensor, add_color_image_tensor, add_edge_mask):
    description, ans1, ans2 = llavaModel.process(original_image_tensor, add_color_image_tensor, add_edge_mask)
    ans_list = []
    if ans1 and ans1 != "":
        ans_list.append(ans1)
    if ans2 and ans2 != "":
        ans_list.append(ans2)
    return ", ".join(ans_list)


@app.route('/api/magic_quill/guess_prompt', methods=['POST'])
def guess_prompt_handler():
    data = request.json
    original_image = data['original_image']
    add_color_image = data.get('add_color_image', '')
    add_edge_image = data.get('add_edge_image', '')

    original_image_tensor = load_and_preprocess_image(original_image)

    if add_color_image:
        add_color_image_tensor = load_and_preprocess_image(add_color_image)
    else:
        add_color_image_tensor = original_image_tensor

    width, height = original_image_tensor.shape[1], original_image_tensor.shape[2]
    add_edge_mask = create_alpha_mask(add_edge_image) if add_edge_image else torch.zeros((1, height, width),
                                                                                         dtype=torch.float32,
                                                                                         device="cpu")
    res = guess(original_image_tensor, add_color_image_tensor, add_edge_mask)
    return jsonify({'result': res})

# STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')


@app.route('/api/image_to_text', methods=['POST'])
def image_to_text_handler():
    data = request.json
    image_path = data.get('image_path')  # e.g. "example.jpg"
    full_path =  image_path

    try:
        # Convert to numpy array and then to tensor with correct shape
        image = Image.open(full_path).convert('RGB')
        image_np = np.array(image)  # shape (H, W, C)
        image_tensor = torch.from_numpy(image_np).float() / 255.0  # normalize

        result = llavaModel.generate_description([image_tensor], "Describe the image in one precise, concise phrase focusing on the main objects and their unique features. Be specific and avoid generic terms. Example: 'A blue half-peeled pear.'")
        return jsonify({'result': result})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f"{type(e).__name__}: {str(e)}"}), 500

@app.route('/api/magic_quill/process_background_img', methods=['POST'])
def process_background_img():
    global RES
    max_size = RES
    data = request.json
    img = data['image']
    resized_img_tensor = load_and_resize_image(img, max_size=max_size)
    resized_img_base64 = "data:image/png;base64," + tensor_to_base64(resized_img_tensor)
    return jsonify({'image': resized_img_base64})

@app.route('/api/magic_quill/generate', methods=['POST'])
def generate_image_handler():
    try:
        global AUTO_SAVE
        data = request.json

        # ===== 1. INPUT VALIDATION =====
        # Check required fields exist
        if 'ms_data' not in data:
            return jsonify({'error': 'Missing ms_data in request'}), 400

        ms_data = data['ms_data']

        # Validate required images
        required_images = ['original_image', 'total_mask']
        for img_key in required_images:
            if img_key not in ms_data or not isinstance(ms_data[img_key], str):
                return jsonify({'error': f'Missing or invalid {img_key}'}), 400

        # ===== 2. PARAMETER PROCESSING =====
        # Handle seed with original logic
        seed = data.get('seed', -1)
        if seed == -1:
            seed = random.randint(0, 2 ** 32 - 1)

        # Get prompt with original empty-scene fallback
        positive_prompt = data.get('prompt', '')  # Changed from data['prompt'] to safe get()

        # ===== 3. IMAGE PREPARATION =====
        # Original image preparation logic
        add_color_image, original_image, total_mask, add_edge_mask, remove_edge_mask = prepare_images_and_masks(
            ms_data['total_mask'],
            ms_data['original_image'],
            ms_data.get('add_color_image', ''),
            ms_data.get('add_edge_image', ''),
            ms_data.get('remove_edge_image', '')
        )

        # Original edge strength adjustment logic
        edge_strength = data.get('edge_strength', 0.55)
        if torch.sum(remove_edge_mask).item() > 0 and torch.sum(add_edge_mask).item() == 0:
            if positive_prompt == "":
                positive_prompt = "empty scene"
            edge_strength = edge_strength / 3.0

        # ===== 4. IMAGE GENERATION =====
        # Original model processing

        latent_samples, final_image, lineart_output, color_output = scribbleColorEditModel.process(
            "SD1.5\\realisticVisionV60B1_v51VAE.safetensors", #"SD1.5\\realisticVisionV60B1_v51VAE.safetensors" in linux
            original_image,
            add_color_image,
            positive_prompt,
            data.get('negative_prompt', ''),
            total_mask,
            add_edge_mask,
            remove_edge_mask,
            data.get('grow_size', 15),
            "enable",  # stroke_as_edge
            data.get('fine_edge', 'disable'),
            edge_strength,  # Use modified value
            data.get('color_strength', 0.55),
            data.get('inpaint_strength', 1.0),
            seed,
            data.get('steps', 20),
            data.get('cfg', 5.0),
            data.get('sampler_name', 'euler_ancestral'),
            data.get('scheduler', 'karras'),
            None  # progress
        )

        # ===== 5. OUTPUT PROCESSING =====
        final_image_base64 = "data:image/png;base64," + tensor_to_base64(final_image)

        # Original auto-save logic
        if AUTO_SAVE:
            auto_save_generated_image(final_image_base64)

        return jsonify({
            'generated_image': final_image_base64,
            'seed': seed
        })

    except Exception as e:
        # New error handling while preserving original behavior
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'trace': traceback.format_exc()
        }), 500


def auto_save_generated_image(res):
    img_str = res
    if img_str.startswith("data:image/png;base64,"):
        img_str = img_str.split(",")[1]
    img_data = base64.b64decode(img_str)
    img = Image.open(io.BytesIO(img_data))

    os.makedirs("output", exist_ok=True)

    timestamp = time.strftime("%Y%m%d_%H%M%S")
#     save_path = os.path.join("output", f"magicquill_{timestamp}.png")
#     img.save(save_path)
#     print(f"Image saved to: {save_path}")


@app.route('/api/settings', methods=['POST'])
def update_settings():
    global AUTO_SAVE, RES
    data = request.json
    if 'auto_save' in data:
        AUTO_SAVE = data['auto_save']
    if 'resolution' in data:
        RES = data['resolution']
    return jsonify({'status': 'success'})


@app.route('/api/checkpoints', methods=['GET'])
def get_checkpoints():
    checkpoints = folder_paths.get_filename_list("checkpoints")
    return jsonify({'checkpoints': checkpoints})


# Serve Vue.js frontend
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_vue(path):
    if path != "" and os.path.exists("dist/" + path):
        return send_from_directory('dist', path)
    else:
        return send_from_directory('dist', 'index.html')


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
	# app.run(host='0.0.0.0', port=5000)
