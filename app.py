import os
import io
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import uuid
from backgroundremover.bg import remove
from openai import OpenAI
import base64, mimetypes
from datetime import datetime
from io import BytesIO
import traceback
from PIL import Image
from io import BytesIO
import base64
import glob

app = Flask(__name__, static_folder='client/dist', static_url_path='')
# CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://localhost:5174","http://localhost:5175", "http://127.0.0.1:10000"]}})
CORS(app)
client = OpenAI()


def static_to_base64(file_path: str) -> str:
    """
    file_path: e.g. 'static/assets/a2e82503-5350-4eb4.png'
    returns:  'data:image/png;base64,AAA...'
    """

    mime, _ = mimetypes.guess_type(file_path) or ('application/octet-stream', None)

    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')

    return f'data:{mime};base64,{b64}'
def base64_to_static(base64_url, output_dir="static/assets"):
    # Ensure the directory exists
    os.makedirs(output_dir, exist_ok=True)

    # Split the header and the base64 data
    if ',' not in base64_url:
        raise ValueError("Invalid base64 image URL")

    header, encoded = base64_url.split(",", 1)

    # Determine the image extension from the header
    if "image/png" in header:
        ext = "png"
    elif "image/jpeg" in header:
        ext = "jpg"
    else:
        raise ValueError("Unsupported image format")

    # Generate unique filename
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(output_dir, unique_name)

    # Decode and save
    with open(file_path, "wb") as f:
        f.write(base64.b64decode(encoded))

    return file_path  # e.g., 'static/assets/abc123.png'

@app.route('/upload', methods=['POST'])
def upload_image():
    print("Upload route hit")
    if 'file' not in request.files:
        print("No file part in request")
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        print("Empty filename")
        return jsonify({"error": "No selected file"}), 400

    unique_name = str(uuid.uuid4())
    filename = f"{unique_name}.png"

    UPLOAD_FOLDER = os.path.join('static', 'assets')
    print(f"Upload folder path: {UPLOAD_FOLDER}")
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    save_path = os.path.join(UPLOAD_FOLDER, filename)
    filepath = f"/static/assets/{filename}"
    # filepath = f"http://localhost:10000/static/assets/{filename}"
    try:
        file.save(save_path)
        print(f"File saved at {save_path}")
    except Exception as e:
        print(f"Exception when saving file: {e}")
        return jsonify({"error": "Failed to save file"}), 500

    # Verify file exists immediately after saving
    if not os.path.exists(save_path):
        print("File does not exist after saving!")
        return jsonify({"error": "File missing after save"}), 500
    else:
        print("File verified on disk")

    return jsonify({"message": "File saved", "filepath": filepath, "id": unique_name})


def remove_bg(src_img_path, out_img_path):
    model_choices = ["u2net", "u2net_human_seg", "u2netp"]
    with open(src_img_path, "rb") as f:
        data = f.read()
    img = remove(
        data,
        model_name=model_choices[0],
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_structure_size=10,
        alpha_matting_base_size=1000
    )
    with open(out_img_path, "wb") as f:
        f.write(img)

@app.route('/remove-bg', methods=['POST'])
def remove_bg_endpoint():
    # remove_bg('static/assets/cherry.jpg', 'static/assets/cherryout.jpg')
    json_data = request.get_json()
    if not json_data or 'src' not in json_data:
        return jsonify({"error": "JSON must include 'src' and 'dst'"}), 400
    src_path = json_data['src']
    if 'static' not in src_path:
        src_path = base64_to_static(src_path)
    unique_name = str(uuid.uuid4())  # e.g. 'a8098c1a-f86e-11da-bd1a-00112444be1e'
    dst_path = f"static/assets/{unique_name}.png"

    try:
        remove_bg(src_path, dst_path)
        return jsonify({"status": "success", "output": static_to_base64(dst_path)})
    except Exception as e:
        print(f"Error during remove_bg: {e}")  # Optional: for debugging
        return jsonify({"error": str(e)}), 500


@app.route('/sample-properties', methods=['POST'])
def sample_properties():
    json_data = request.get_json()
    prompt = json_data.get('prompt', '')

    try:

        response = client.responses.create(
            model="gpt-4.1-nano",
            input=prompt
        )
        # Process result
        print(response.output_text)

        return jsonify({

            "output": response.output_text,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

@app.route('/text-to-image', methods=['POST','OPTIONS'])
def text_to_image():
    if request.method == "OPTIONS":
        return "", 200
    json_data = request.get_json()
    if not json_data or 'prompt' not in json_data:
        return jsonify({"error": "JSON must include 'image_base64' and 'output_path'"}), 400

    prompt = json_data.get('prompt', '')
    # output_path = json_data['output_path']

    try:
        result = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            quality="high",
            size="1024x1024",
        )

        # Process result
        result_base64 = result.data[0].b64_json
        result_base64 = f"data:image/png;base64,{result_base64}"

        return jsonify({
            "status": "success",
            "output": result_base64,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

@app.route('/edit-image', methods=['POST','OPTIONS'])
def edit_image():
    if request.method == "OPTIONS":
        return "", 200
    json_data = request.get_json()

    prompt = json_data.get('prompt', '')
    original_image = json_data.get('original_image')  #  base64
    total_mask = json_data.get('total_mask')  #  base64
    try:
        original_image_path = "static/assets/original_image.png"
        if original_image.startswith("data:image"):
            original_image = original_image.split(",", 1)[1]
        os.makedirs(os.path.dirname(original_image_path), exist_ok=True)
        with open(original_image_path, "wb") as f:
            f.write(base64.b64decode(original_image))
        if total_mask:
            total_mask_path = "static/assets/total_mask.png"
            if total_mask.startswith("data:image"):
                total_mask = total_mask.split(",", 1)[1]
            os.makedirs(os.path.dirname(total_mask_path), exist_ok=True)
            with open(total_mask_path, "wb") as f:
                 f.write(base64.b64decode(total_mask))
            print('openai edit image with mask')
            result = client.images.edit(
                model="gpt-image-1", #dall-e-2
                image=open(original_image_path, "rb"),
                mask=open(total_mask_path, "rb"),
                prompt=prompt,
                size="1024x1024",

            )
        else:
            print('openai edit whole image')
            result = client.images.edit(
                model="gpt-image-1", #dall-e-2
                image=open(original_image_path, "rb"),
                prompt=prompt,
                size="1024x1024",

            )
        result_base64 = result.data[0].b64_json
        result_base64 = f"data:image/png;base64,{result_base64}"


        return jsonify({
            "status": "success",
            "output": result_base64,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

@app.route('/edit-with-ref', methods=['POST', 'OPTIONS'])
def edit_with_ref():
    if request.method == 'OPTIONS':
        # Respond to preflight with OK status
        return '', 200
    json_data = request.get_json()

    prompt = json_data.get('prompt', '')
    # original_image = json_data.get('original_image')  #  base64
    ref_images = json_data.get('ref_images')  #  [base64, base64, ...]
    try:
        # Create a unique temporary folder for this request
        request_id = datetime.now().strftime('%Y%m%d%H%M%S') + '_' + str(uuid.uuid4())
        temp_dir = Path(f"static/temp/{request_id}")
        temp_dir.mkdir(parents=True, exist_ok=True)

        ref_image_paths = []
        for i, ref_img in enumerate(ref_images):
            try:
                if ref_img.startswith("data:image"):
                    ref_img = ref_img.split(",", 1)[1]

                ref_path = temp_dir / f"ref_image_{i}.png"
                with open(ref_path, "wb") as f:
                    f.write(base64.b64decode(ref_img))
                ref_image_paths.append(str(ref_path))
            except Exception as e:
                print(f"Error saving ref_image_{i}: {e}")

        # Open all as binary file objects
        ref_image_files = [open(path, "rb") for path in ref_image_paths]

        result = client.images.edit(
            model="gpt-image-1",
            # image=[open(original_image_path, "rb")] + ref_image_files,
            image=ref_image_files,
            prompt=prompt,
            size="1024x1024",

        )

        result_base64 = result.data[0].b64_json
        result_base64 = f"data:image/png;base64,{result_base64}"

        return jsonify({
            "status": "success",
            "output": result_base64,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500


@app.route('/image-to-labels', methods=['POST'])
def image_to_labels():

    data = request.json
    image_path = data.get('image_path')  # either staitc/... or base64
    if (image_path.startswith("data:image")):
        full_path =  image_path
    else:
         full_path = static_to_base64(image_path)
    prompt = data.get('prompt')
    system_prompt = data.get('system_prompt')
    try:
        response = client.responses.create(
            model="gpt-4o-mini",

            input=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {
                        "type": "input_image",
                        "image_url": full_path,
                    },
                ],
            }],

        )

        print(response.output[0].content[0].text)
        return jsonify({
            "status": "success",
            "output": response.output[0].content[0].text,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500


@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_files(path):
    # 1. Try frontend build folder (client/dist)
    frontend_path = os.path.join(app.static_folder, path)
    if os.path.exists(frontend_path):
        return send_from_directory(app.static_folder, path)

    # 2. Try static/assets/
    assets_path = os.path.join('static/assets', path)
    if os.path.exists(assets_path):
        return send_from_directory('static/assets', path)

    # 3. Try static/temp/
    temp_path = os.path.join('static/temp', path)
    if os.path.exists(temp_path):
        return send_from_directory('static/temp', path)

    # 4. Try static/ base folder
    static_path = os.path.join('static', path)
    if os.path.exists(static_path):
        return send_from_directory('static', path)

    # 5. Not found anywhere
    abort(404)

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))  # fallback to 10000 locally
    app.run(host='0.0.0.0', port=port)