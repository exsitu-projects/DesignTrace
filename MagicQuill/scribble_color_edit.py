import torch.nn.functional as F
import torch
import numpy as np
from PIL import Image
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from .brushnet_nodes import BrushNetLoader, BrushNet, BlendInpaint, get_files_with_extension
from .comfyui_utils import CheckpointLoaderSimple, ControlNetLoader, ControlNetApplyAdvanced, CLIPTextEncode, KSampler, VAEDecode, GrowMask, PIDINET_Preprocessor, LineArt_Preprocessor, Color_Preprocessor

class ScribbleColorEditModel():
    def __init__(self):
        self.checkpoint_loader = CheckpointLoaderSimple()
        self.clip_text_encoder = CLIPTextEncode()
        self.mask_processor = GrowMask()
        self.controlnet_loader = ControlNetLoader()
        self.scribble_processor = PIDINET_Preprocessor()
        self.lineart_processor = LineArt_Preprocessor()
        self.color_processor = Color_Preprocessor()
        self.brushnet_loader = BrushNetLoader()
        self.brushnet_node = BrushNet()
        self.controlnet_apply = ControlNetApplyAdvanced()
        self.ksampler = KSampler()
        self.vae_decoder = VAEDecode()
        self.blender = BlendInpaint()
        self.ckpt_name = os.path.join("SD1.5", "realisticVisionV60B1_v51VAE.safetensors")
        with torch.no_grad():
            self.model, self.clip, self.vae = self.checkpoint_loader.load_checkpoint(self.ckpt_name)
        self.load_models('SD1.5', 'float16')

    def load_models(self, base_model_version="SD1.5", dtype='float16'):
        if base_model_version == "SD1.5":
            edge_controlnet_name = "control_v11p_sd15_scribble.safetensors"
            color_controlnet_name = "color_finetune.safetensors"
            brushnet_name = os.path.join("brushnet", "random_mask_brushnet_ckpt", "diffusion_pytorch_model.safetensors")
        else:
            raise ValueError("Invalid base_model_version, not supported yet!!!: {}".format(base_model_version))
        self.edge_controlnet = self.controlnet_loader.load_controlnet(edge_controlnet_name)[0]
        self.color_controlnet = self.controlnet_loader.load_controlnet(color_controlnet_name)[0]
        self.brushnet_loader.inpaint_files = get_files_with_extension('inpaint')
        print("self.brushnet_loader.inpaint_files: ", get_files_with_extension('inpaint'))
        self.brushnet = self.brushnet_loader.brushnet_loading(brushnet_name, dtype)[0]
    
    def process(self, ckpt_name, image, colored_image, positive_prompt, negative_prompt, mask, add_mask, remove_mask, grow_size, stroke_as_edge, fine_edge, edge_strength, color_strength, inpaint_strength, seed, steps, cfg, sampler_name, scheduler, base_model_version='SD1.5', dtype='float16', palette_resolution=2048):
        if ckpt_name != self.ckpt_name:
            self.ckpt_name = ckpt_name
            with torch.no_grad():
                self.model, self.clip, self.vae = self.checkpoint_loader.load_checkpoint(ckpt_name)
        if not hasattr(self, 'edge_controlnet') or not hasattr(self, 'color_controlnet') or not hasattr(self, 'brushnet'):
            self.load_models(base_model_version, dtype)
            
        positive = self.clip_text_encoder.encode(self.clip, positive_prompt)[0]
        negative = self.clip_text_encoder.encode(self.clip, negative_prompt)[0]        

        mask = self.mask_processor.expand_mask(mask, expand=grow_size, tapered_corners=True)[0]

        image_copy = image.clone()
        if stroke_as_edge == "disable":
            bool_add_mask = add_mask > 0.5
            mean_brightness = image_copy[bool_add_mask].mean()
            if mean_brightness > 0.8:
                image_copy[bool_add_mask] = 0.0
            else:
                image_copy[bool_add_mask] = 1.0
                

        if not torch.equal(image, colored_image):
            print("Apply color controlnet")
            color_output = self.color_processor.execute(colored_image, resolution=palette_resolution)[0]
            lineart_output = self.lineart_processor.execute(image, resolution=512, coarse=False)[0]
            positive, negative = self.controlnet_apply.apply_controlnet(positive, negative, self.color_controlnet, color_output, color_strength, 0.0, 1.0)
            positive, negative = self.controlnet_apply.apply_controlnet(positive, negative, self.edge_controlnet, lineart_output, 0.8, 0.0, 1.0)
        else:
            print("Apply edge controlnet")
            # Resize masks to match the dimensions of lineart_output
            color_output = self.color_processor.execute(image, resolution=palette_resolution)[0]
            if fine_edge == "enable":
                lineart_output = self.lineart_processor.execute(image, resolution=512, coarse=False)[0]
            else:
                lineart_output = self.scribble_processor.execute(image, resolution=512)[0]
            add_mask_resized = F.interpolate(add_mask.unsqueeze(0).unsqueeze(0).float(), size=(1, lineart_output.shape[1], lineart_output.shape[2]), mode='nearest').squeeze(0).squeeze(0)
            remove_mask_resized = F.interpolate(remove_mask.unsqueeze(0).unsqueeze(0).float(), size=(1, lineart_output.shape[1], lineart_output.shape[2]), mode='nearest').squeeze(0).squeeze(0)

            bool_add_mask_resized = (add_mask_resized > 0.5)
            bool_remove_mask_resized = (remove_mask_resized > 0.5)

            if stroke_as_edge == "enable":
                lineart_output[bool_remove_mask_resized] = 0.0
                lineart_output[bool_add_mask_resized] = 1.0
            else:
                lineart_output[bool_remove_mask_resized & ~bool_add_mask_resized] = 0.0
            positive, negative = self.controlnet_apply.apply_controlnet(positive, negative, self.edge_controlnet, lineart_output, edge_strength, 0.0, 1.0)

        # BrushNet
        model, positive, negative, latent = self.brushnet_node.model_update(
            model=self.model,
            vae=self.vae,
            image=image,
            mask=mask,
            brushnet=self.brushnet,
            positive=positive,
            negative=negative,
            scale=inpaint_strength,
            start_at=0,
            end_at=10000
        )

        # KSampler Node
        latent_samples = self.ksampler.sample(
            model=model, 
            seed=seed, 
            steps=steps, 
            cfg=cfg, 
            sampler_name=sampler_name, 
            scheduler=scheduler, 
            positive=positive, 
            negative=negative, 
            latent_image=latent,
        )[0]

        # Image Blending
        final_image = self.vae_decoder.decode(self.vae, latent_samples)[0]
        final_image = self.blender.blend_inpaint(final_image, image, mask, kernel=10, sigma=10.0)[0]

        # Return the final image
        return (latent_samples, final_image, lineart_output, color_output)
