import subprocess
import os
import gradio as gr
import os
from gradio_magicquill import MagicQuill
import random
import torch
import numpy as np
from PIL import Image, ImageOps
import base64
import io
from fastapi import FastAPI, Request
import uvicorn
import requests
from MagicQuill import folder_paths
from MagicQuill.llava_new import LLaVAModel
from MagicQuill.scribble_color_edit import ScribbleColorEditModel
import time
import io
from gradio_client import Client

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

def guess_prompt_handler(original_image, add_color_image, add_edge_image):
    original_image_tensor = load_and_preprocess_image(original_image)
    
    if add_color_image:
        add_color_image_tensor = load_and_preprocess_image(add_color_image)
    else:
        add_color_image_tensor = original_image_tensor
    
    width, height = original_image_tensor.shape[1], original_image_tensor.shape[2]
    add_edge_mask = create_alpha_mask(add_edge_image) if add_edge_image else torch.zeros((1, height, width), dtype=torch.float32, device="cpu")
    res = guess(original_image_tensor, add_color_image_tensor, add_edge_mask)
    return res

def generate(ckpt_name, total_mask, original_image, add_color_image, add_edge_image, remove_edge_image, positive_prompt, negative_prompt, grow_size, stroke_as_edge, fine_edge, edge_strength, color_strength, inpaint_strength, seed, steps, cfg, sampler_name, scheduler):
    add_color_image, original_image, total_mask, add_edge_mask, remove_edge_mask = prepare_images_and_masks(total_mask, original_image, add_color_image, add_edge_image, remove_edge_image)
    progress = None

    print("gradio run generate")

    if torch.sum(remove_edge_mask).item() > 0 and torch.sum(add_edge_mask).item() == 0:
        if positive_prompt == "":
            positive_prompt = "empty scene"
        edge_strength /= 3.
#     print("ckpt_name")
#     print(ckpt_name)
#
#     print("original_image")
#     print(original_image)
#
#     print("add_color_image")
#     print(add_color_image)
#
#     print("positive_prompt")
#     print(positive_prompt)
#
#     print("negative_prompt")
#     print(negative_prompt)
#
#     print("total_mask")
#     print(total_mask)
#
#     print("add_edge_mask")
#     print(add_edge_mask)
#
#     print("remove_edge_mask")
#     print(remove_edge_mask)
#
#     print("grow_size")
#     print(grow_size)
#
#     print("stroke_as_edge")
#     print(stroke_as_edge)
#
#     print("fine_edge")
#     print(fine_edge)
#
#     print("edge_strength")
#     print(edge_strength)
#
#     print("color_strength")
#     print(color_strength)
#
#     print("inpaint_strength")
#     print(inpaint_strength)
#
#     print("seed")
#     print(seed)
#
#     print("steps")
#     print(steps)
#
#     print("cfg")
#     print(cfg)
#
#     print("sampler_name")
#     print(sampler_name)
#
#     print("scheduler")
#     print(scheduler)
#
#     print("progress")
#     print(progress)

    latent_samples, final_image, lineart_output, color_output = scribbleColorEditModel.process(
        ckpt_name,
        original_image, 
        add_color_image, 
        positive_prompt, 
        negative_prompt, 
        total_mask, 
        add_edge_mask, 
        remove_edge_mask, 
        grow_size, 
        stroke_as_edge, 
        fine_edge,
        edge_strength, 
        color_strength,  
        inpaint_strength, 
        seed, 
        steps, 
        cfg, 
        sampler_name, 
        scheduler,
        progress
    )

    final_image_base64 = tensor_to_base64(final_image)
    return final_image_base64
def show_tensor_image(tensor, title='Image'):
    # Remove batch dimension if present
    if tensor.dim() == 4:
        tensor = tensor[0]

    img = tensor.detach().cpu().numpy()

    if img.ndim == 2:
        # Grayscale
        img = (img * 255).astype(np.uint8)
        image = Image.fromarray(img, mode='L')

    elif img.ndim == 3:
        if img.shape[0] == 1:
            # (1, H, W) → (H, W)
            img = img[0]
            img = (img * 255).astype(np.uint8)
            image = Image.fromarray(img, mode='L')
        elif img.shape[0] == 3:
            # (3, H, W) → (H, W, 3)
            img = np.transpose(img, (1, 2, 0))
            img = (img * 255).astype(np.uint8)
            image = Image.fromarray(img, mode='RGB')
        elif img.shape[2] == 3:
            # Already (H, W, 3)
            img = (img * 255).astype(np.uint8)
            image = Image.fromarray(img, mode='RGB')
        else:
            raise ValueError(f"Unexpected 3D tensor shape: {img.shape}")
    else:
        raise ValueError(f"Unexpected tensor shape: {img.shape}")
    image.save(f"gradio_used_imgs/{title}.png")

def generate_image_handler(x, ckpt_name, negative_prompt, fine_edge, grow_size, edge_strength, color_strength, inpaint_strength, seed, steps, cfg, sampler_name, scheduler):
    if seed == -1:
        seed = random.randint(0, 2**32 - 1)
    ms_data = x['from_frontend']
    positive_prompt = x['from_backend']['prompt']
    stroke_as_edge = "enable"
    print( 'total_mask:::::' )
    print( ms_data['total_mask'])
    show_base64_image(ms_data['original_image'], title="Original Image")
    show_base64_image(ms_data['add_color_image'], title="Color Image")
    show_base64_image(ms_data['total_mask'], title="Total Mask")
    show_base64_image(ms_data['add_edge_image'], title="Add Edge Mask")
    show_base64_image(ms_data['remove_edge_image'], title="Remove Edge Mask")


    res = generate(
        ckpt_name,
        ms_data['total_mask'],
        ms_data['original_image'],
        ms_data['add_color_image'],
        ms_data['add_edge_image'],
        ms_data['remove_edge_image'],
        positive_prompt,
        negative_prompt,
        grow_size,
        stroke_as_edge,
        fine_edge,
        edge_strength,
        color_strength,
        inpaint_strength,
        seed,
        steps,
        cfg,
        sampler_name,
        scheduler
    )
    x["from_backend"]["generated_image"] = res
    global AUTO_SAVE
    if AUTO_SAVE:
        auto_save_generated_image(res)
    return x

def auto_save_generated_image(res):
    img_str = res
    if img_str.startswith("data:image/png;base64,"):
        img_str = img_str.split(",")[1]
    img_data = base64.b64decode(img_str)
    img = Image.open(io.BytesIO(img_data))
    
    os.makedirs("output", exist_ok=True)
    
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    save_path = os.path.join("output", f"magicquill_{timestamp}.png")
    img.save(save_path)
    print(f"Image saved to: {save_path}")

css = '''
.row {
    width: 90%;
    margin: auto;
}
footer {
    visibility: 
    hidden
}
'''

with gr.Blocks(css=css) as demo:
    with gr.Row(elem_classes="row"):
        ms = MagicQuill()
    with gr.Row(elem_classes="row"):
        with gr.Column():
            btn = gr.Button("Run", variant="primary")
        with gr.Column():
            with gr.Accordion("parameters", open=False):
                ckpt_name = gr.Dropdown(
                    label="Base Model Name",
                    choices=folder_paths.get_filename_list("checkpoints"),
                    value=os.path.join('SD1.5', 'realisticVisionV60B1_v51VAE.safetensors'),
                    interactive=True
                )
                auto_save_checkbox = gr.Checkbox(
                    label="Auto Save",
                    value=False,
                    interactive=True
                )
                resolution_slider = gr.Slider(
                    label="Resolution (Please update this before you upload the image ;).)",
                    minimum=256,
                    maximum=2048,
                    value=512,
                    step=64,
                    interactive=True
                )
                negative_prompt = gr.Textbox(
                    label="Negative Prompt",
                    value="",
                    interactive=True
                )
                # stroke_as_edge = gr.Radio(
                #     label="Stroke as Edge",
                #     choices=['enable', 'disable'],
                #     value='enable',
                #     interactive=True
                # )
                fine_edge = gr.Radio(
                    label="Fine Edge",
                    choices=['enable', 'disable'],
                    value='disable',
                    interactive=True
                )
                grow_size = gr.Slider(
                    label="Grow Size",
                    minimum=0,
                    maximum=100,
                    value=15,
                    step=1,
                    interactive=True
                )
                edge_strength = gr.Slider(
                    label="Edge Strength",
                    minimum=0.0,
                    maximum=5.0,
                    value=0.55,
                    step=0.01,
                    interactive=True
                )
                color_strength = gr.Slider(
                    label="Color Strength",
                    minimum=0.0,
                    maximum=5.0,
                    value=0.55,
                    step=0.01,
                    interactive=True
                )
                inpaint_strength = gr.Slider(
                    label="Inpaint Strength",
                    minimum=0.0,
                    maximum=5.0,
                    value=1.0,
                    step=0.01,
                    interactive=True
                )
                seed = gr.Number(
                    label="Seed",
                    value=-1,
                    precision=0,
                    interactive=True
                )
                steps = gr.Slider(
                    label="Steps",
                    minimum=1,
                    maximum=50,
                    value=20,
                    interactive=True
                )
                cfg = gr.Slider(
                    label="CFG",
                    minimum=0.0,
                    maximum=100.0,
                    value=5.0,
                    step=0.1,
                    interactive=True
                )
                sampler_name = gr.Dropdown(
                    label="Sampler Name",
                    choices=["euler", "euler_ancestral", "heun", "heunpp2","dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde", "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu", "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ddim", "uni_pc", "uni_pc_bh2"],
                    value='euler_ancestral',
                    interactive=True
                )
                scheduler = gr.Dropdown(
                    label="Scheduler",
                    choices=["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform"],
                    value='karras',
                    interactive=True
                )

        def update_auto_save(value):
            global AUTO_SAVE
            AUTO_SAVE = value
            
        def update_resolution(value):
            global RES
            RES = value

        auto_save_checkbox.change(fn=update_auto_save, inputs=[auto_save_checkbox])
        resolution_slider.change(fn=update_resolution, inputs=[resolution_slider])
        btn.click(generate_image_handler, inputs=[ms, ckpt_name, negative_prompt, fine_edge, grow_size, edge_strength, color_strength, inpaint_strength, seed, steps, cfg, sampler_name, scheduler], outputs=ms)
    
app = FastAPI()

def show_base64_image(base64_url, title='Image'):
    # Remove the "data:image/..." prefix if present
    if base64_url.startswith("data:image"):
        base64_url = base64_url.split(",", 1)[1]

    image_data = base64.b64decode(base64_url)
    image = Image.open(io.BytesIO(image_data))
#     image.show(title=title)  # This opens the default image viewer
# Save with a meaningful filename
    filename = f"{title.replace(' ', '_')}.png"
    image.save(filename)

    # Open it using the default viewer
    os.system(filename)



@app.post("/magic_quill/guess_prompt")
async def guess_prompt(request: Request):
    data = await request.json()
    res = guess_prompt_handler(data['original_image'], data['add_color_image'], data['add_edge_image'])
    return res

@app.post("/magic_quill/process_background_img")
async def process_background_img(request: Request):
    global RES
    max_size = RES
    img = await request.json()
    print("max_size:", max_size)
    resized_img_tensor = load_and_resize_image(img, max_size=max_size)
    resized_img_base64 = "data:image/png;base64," + tensor_to_base64(resized_img_tensor)
    # add more processing here
    return resized_img_base64

app = gr.mount_gradio_app(app, demo, path="/")
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=7860)
#     uvicorn.run(app, host="0.0.0.0", port=7860)
