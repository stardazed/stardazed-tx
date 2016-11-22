// texture - texture objects
// Part of Stardazed TX
// (c) 2015-2016 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed-tx

import { assert, cloneStruct } from "core/util";
import { isPowerOf2, clamp } from "math/util";
import { RenderContext } from "render/rendercontext";
import { PixelFormat, PixelDimensions, pixelFormatIsCompressed, glImageFormatForPixelFormat, glPixelDataTypeForPixelFormat } from "render/pixelformat";
import { TextureClass, TextureDescriptor, SamplerDescriptor, TextureMipFilter, TextureSizingFilter, TextureRepeatMode } from "render/texture-desc";
import { TextureImageSource, TextureImageData, TextureUsageHint } from "render/texture-desc";

function glRenderBufferInternalFormatForPixelFormat(rc: RenderContext, format: PixelFormat) {
	const gl = rc.gl;

	switch (format) {
		// sRGB
		case PixelFormat.SRGB8_Alpha8:
			return rc.extSRGB ? rc.extSRGB.SRGB8_ALPHA8_EXT : gl.NONE;

		// Packed
		case PixelFormat.RGB_5_6_5:
			return gl.RGB565;
		case PixelFormat.RGBA_4_4_4_4:
			return gl.RGBA4;
		case PixelFormat.RGBA_5_5_5_1:
			return gl.RGB5_A1;

		// Depth / Stencil
		case PixelFormat.Depth16I:
			return gl.DEPTH_COMPONENT16;
		case PixelFormat.Stencil8:
			return gl.STENCIL_INDEX8;

		default:
			// unsupported RenderBuffer pixel format
			return gl.NONE;
	}
}


function glTextureRepeatMode(rc: RenderContext, repeat: TextureRepeatMode) {
	switch (repeat) {
		case TextureRepeatMode.Repeat: return rc.gl.REPEAT;
		case TextureRepeatMode.MirroredRepeat: return rc.gl.MIRRORED_REPEAT;
		case TextureRepeatMode.ClampToEdge: return rc.gl.CLAMP_TO_EDGE;

		default:
			assert(false, "Invalid TextureRepeatMode");
			return rc.gl.NONE;
	}
}


function glTextureMinificationFilter(rc: RenderContext, minFilter: TextureSizingFilter, mipFilter: TextureMipFilter) {
	let glSizingFilter: number;

	if (mipFilter == TextureMipFilter.None) {
		if (minFilter == TextureSizingFilter.Nearest) {
			glSizingFilter = rc.gl.NEAREST;
		}
		else {
			glSizingFilter = rc.gl.LINEAR;
		}
	}
	else if (mipFilter == TextureMipFilter.Nearest) {
		if (minFilter == TextureSizingFilter.Nearest) {
			glSizingFilter = rc.gl.NEAREST_MIPMAP_NEAREST;
		}
		else {
			glSizingFilter = rc.gl.LINEAR_MIPMAP_NEAREST;
		}
	}
	else {
		if (minFilter == TextureSizingFilter.Nearest) {
			glSizingFilter = rc.gl.NEAREST_MIPMAP_LINEAR;
		}
		else {
			glSizingFilter = rc.gl.LINEAR_MIPMAP_LINEAR;
		}
	}

	return glSizingFilter;
}


function glTextureMagnificationFilter(rc: RenderContext, magFilter: TextureSizingFilter) {
	if (magFilter == TextureSizingFilter.Nearest) {
		return rc.gl.NEAREST;
	}
	else {
		return rc.gl.LINEAR;
	}
}


const textureLimits = {
	maxDimension: 0,
	maxDimensionCube: 0,
	maxAnisotropy: 0
};


function maxTextureDimension(rc: RenderContext, texClass: TextureClass) {
	if (textureLimits.maxDimension == 0) {
		textureLimits.maxDimension = rc.gl.getParameter(rc.gl.MAX_TEXTURE_SIZE);
		textureLimits.maxDimensionCube = rc.gl.getParameter(rc.gl.MAX_CUBE_MAP_TEXTURE_SIZE);
	}

	if (texClass == TextureClass.TexCube) {
		return textureLimits.maxDimensionCube;
	}
	return textureLimits.maxDimension;
}


function maxAllowedAnisotropy(rc: RenderContext) {
	if (textureLimits.maxAnisotropy == 0) {
		textureLimits.maxAnisotropy =
			rc.extTexAnisotropy ?
			rc.gl.getParameter(rc.extTexAnisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) :
			1;
	}

	return textureLimits.maxAnisotropy;
}


export class Texture {
	private textureClass_: TextureClass;
	private dim_: PixelDimensions;
	private mipmaps_: number;
	private pixelFormat_: PixelFormat;
	private sampler_: SamplerDescriptor;
	private resource_: WebGLTexture | WebGLRenderbuffer;
	private glTarget_: number;


	private createRenderBuffer() {
		const gl = this.rc.gl;

		assert(this.mipmaps == 1, "Cannot create RenderBuffers with multiple levels");

		// RenderBuffers in WebGL are restricted to 16-bit colour, 16-bit depth or 8-bit stencil formats
		const sizedFormat = glRenderBufferInternalFormatForPixelFormat(this.rc, this.pixelFormat_);
		if (sizedFormat == gl.NONE) {
			// fallback to normal texture if not compatible
			console.warn("Incompatible PixelFormat for RenderBuffer: falling back to Tex2D");
			this.createTex2D();
		}
		else {
			this.glTarget_ = gl.RENDERBUFFER;
			const rb = gl.createRenderbuffer()!; // TODO: handle resource allocation failure
			gl.bindRenderbuffer(this.glTarget_, rb);
			gl.renderbufferStorage(this.glTarget_, sizedFormat, this.width, this.height);
			gl.bindRenderbuffer(this.glTarget_, null);
		}
	}


	private createTex2D(pixelData?: TextureImageData[]) {
		const gl = this.rc.gl;

		// -- input checks
		assert((pixelData == null) || (pixelData.length == 1), "Tex2D pixelData array must contain 1 item or be omitted completely.");
		const texPixelData = (pixelData && pixelData[0]) || null;

		const glPixelFormat = glImageFormatForPixelFormat(this.rc, this.pixelFormat_);
		const glPixelType = glPixelDataTypeForPixelFormat(this.rc, this.pixelFormat_);

		if (pixelFormatIsCompressed(this.pixelFormat_)) {
			assert(texPixelData && ("byteLength" in texPixelData), "Compressed textures MUST provide pixelData");
		}

		// -- create resource
		const tex = this.resource_ = gl.createTexture()!; // TODO: handle resource allocation failure
		this.glTarget_ = gl.TEXTURE_2D;
		gl.bindTexture(this.glTarget_, tex);

		// -- allocate and fill pixel storage
		const w = this.width;
		const h = this.height;

		if (pixelFormatIsCompressed(this.pixelFormat_)) {
			gl.compressedTexImage2D(this.glTarget_, 0, glPixelFormat, w, h, 0, <ArrayBufferView>texPixelData);
		}
		else {
			if ((texPixelData == null) || ("byteLength" in texPixelData)) {
				// either no data or raw pixel data
				gl.texImage2D(this.glTarget_, 0, glPixelFormat, w, h, 0, glPixelFormat, glPixelType, <ArrayBufferView>texPixelData);
			}
			else {
				// a TexImageSource was provided
				const tis = <TextureImageSource>texPixelData;
				assert((tis.width == w) && (tis.height == h), "Tex2D imageSource's size does not match descriptor");
				gl.texImage2D(this.glTarget_, 0, glPixelFormat, glPixelFormat, glPixelType, <any>tis);
			}
		}

		// -- generate mipmaps if requested (TODO: user provided mipmaps not supported)
		if (this.mipmaps_ > 1) {
			gl.generateMipmap(this.glTarget_);
		}

		gl.bindTexture(this.glTarget_, null);
	}


	private createTexCube(pixelData?: TextureImageData[]) {
		const gl = this.rc.gl;

		// -- input checks
		assert((pixelData == null) || (pixelData.length == 6), "TexCube pixelData array must contain 6 items or be omitted completely.");

		const glPixelFormat = glImageFormatForPixelFormat(this.rc, this.pixelFormat_);
		const glPixelType = glPixelDataTypeForPixelFormat(this.rc, this.pixelFormat_);

		// -- create resource
		const tex = this.resource_ = gl.createTexture()!; // TODO: handle resource allocation failure
		this.glTarget_ = gl.TEXTURE_CUBE_MAP;
		gl.bindTexture(this.glTarget_, tex);

		// -- allocate and fill pixel storage
		const w = this.width;
		const h = this.height;
		assert(w == h, "TexCube textures MUST have the same width and height");

		if (pixelFormatIsCompressed(this.pixelFormat_)) {
			assert(pixelData && (pixelData.length == 6), "Compressed textures MUST provide pixelData");

			for (let layer = 0; layer < 6; ++layer) {
				const layerPixels = pixelData![layer];
				assert(layerPixels && ("byteLength" in layerPixels), `pixelData source ${layer} for compressed TexCube is not an ArrayBufferView`);
				gl.compressedTexImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, 0, glPixelFormat, w, h, 0, <ArrayBufferView>layerPixels);
			}
		}
		else {
			for (let layer = 0; layer < 6; ++layer) {
				const texPixelData = (pixelData && pixelData[layer]) || null;

				if ((texPixelData == null) || ("byteLength" in texPixelData)) {
					// either no data or raw pixel data
					gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, 0, glPixelFormat, w, h, 0, glPixelFormat, glPixelType, <ArrayBufferView>texPixelData);
				}
				else {
					// a TexImageSource was provided
					const tis = <TextureImageSource>texPixelData;
					assert((tis.width == w) && (tis.height == h), `TexCube pixelData ${layer}'s size does not match descriptor`);
					gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, 0, glPixelFormat, glPixelFormat, glPixelType, <any>texPixelData);
				}
			}
		}

		// -- generate mipmaps if requested (TODO: user provided mipmaps not supported)
		if (this.mipmaps_ > 1) {
			gl.generateMipmap(this.glTarget_);
		}

		gl.bindTexture(this.glTarget_, null);
	}


	constructor(private rc: RenderContext, desc: TextureDescriptor) {
		this.textureClass_ = desc.textureClass;
		this.dim_ = cloneStruct(desc.dim);
		this.mipmaps_ = desc.mipmaps;
		this.pixelFormat_ = desc.pixelFormat;
		this.sampler_ = cloneStruct(desc.sampling);

		// -- check input
		assert(this.mipmaps_ > 0);
		assert(this.width > 0);
		assert(this.height > 0);

		assert(this.width <= maxTextureDimension(rc, this.textureClass_));
		assert(this.height <= maxTextureDimension(rc, this.textureClass_));

		// -- WebGL imposes several restrictions on Non-Power-of-Two textures
		const npot = !(isPowerOf2(this.width) && isPowerOf2(this.height));
		if (npot) {
			if (this.sampler_.repeatS != TextureRepeatMode.ClampToEdge || this.sampler_.repeatT != TextureRepeatMode.ClampToEdge) {
				console.warn("NPOT textures cannot repeat, overriding with ClampToEdge", desc);
				this.sampler_.repeatS = TextureRepeatMode.ClampToEdge;
				this.sampler_.repeatT = TextureRepeatMode.ClampToEdge;
			}
			if (this.mipmaps_ > 1) {
				console.warn("NPOT textures cannot have mipmaps, setting levels to 1", desc);
				this.mipmaps_ = 1;
			}
			if (this.sampler_.mipFilter != TextureMipFilter.None) {
				console.warn("NPOT textures cannot have mipmaps, overriding with MipFilter.None", desc);
				this.sampler_.mipFilter = TextureMipFilter.None;
			}
		}

		const gl = rc.gl;

		// -- create resource
		if (desc.textureClass == TextureClass.Tex2D) {
			if (desc.usageHint == TextureUsageHint.RenderTargetOnly) {
				assert(desc.pixelData == null, "RenderBuffers cannot be initialized with pixeldata");
				this.createRenderBuffer();
			}
			else {
				this.createTex2D(desc.pixelData);
			}
		}
		else {
			this.createTexCube(desc.pixelData);
		}

		// -- apply sampling parameters
		if (this.glTarget_ != gl.RENDERBUFFER) {
			gl.bindTexture(this.glTarget_, <WebGLTexture>this.resource_);

			// -- wrapping
			gl.texParameteri(this.glTarget_, gl.TEXTURE_WRAP_S, glTextureRepeatMode(rc, this.sampler_.repeatS));
			gl.texParameteri(this.glTarget_, gl.TEXTURE_WRAP_T, glTextureRepeatMode(rc, this.sampler_.repeatS));

			// -- mini-/magnification
			if (this.mipmaps_ == 1) {
				this.sampler_.mipFilter = TextureMipFilter.None;
			}
			gl.texParameteri(this.glTarget_, gl.TEXTURE_MIN_FILTER, glTextureMinificationFilter(rc, this.sampler_.minFilter, this.sampler_.mipFilter));
			gl.texParameteri(this.glTarget_, gl.TEXTURE_MAG_FILTER, glTextureMagnificationFilter(rc, this.sampler_.magFilter));

			// -- anisotropy
			if (rc.extTexAnisotropy) {
				const anisotropy = clamp(this.sampler_.maxAnisotropy, 1, maxAllowedAnisotropy(rc));
				gl.texParameterf(this.glTarget_, rc.extTexAnisotropy.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
			}

			gl.bindTexture(this.glTarget_, null);
		}
	}


	// -- binding
	bind() {
		const gl = this.rc.gl;
		if (this.glTarget_ == gl.RENDERBUFFER) {
			gl.bindRenderbuffer(gl.RENDERBUFFER, <WebGLRenderbuffer>this.resource_);
		}
		else {
			gl.bindTexture(this.glTarget_, <WebGLTexture>this.resource_);
		}
	}


	unbind() {
		const gl = this.rc.gl;
		if (this.glTarget_ == gl.RENDERBUFFER) {
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);
		}
		else {
			gl.bindTexture(this.glTarget_, null);
		}
	}


	// -- observers
	get dim() { return cloneStruct(this.dim_); }
	get width() { return this.dim_.width; }
	get height() { return this.dim_.height; }

	get mipmaps() { return this.mipmaps_; }
	get isMipMapped() { return this.mipmaps_ > 1; }

	get pixelFormat() { return this.pixelFormat_; }

	get textureClass() { return this.textureClass_; };
	get clientWritable() {
		return this.glTarget_ != this.rc.gl.RENDERBUFFER; // later also != TEXTURE_2D_MULTISAMPLE
	}
	get renderTargetOnly() {
		return this.glTarget_ == this.rc.gl.RENDERBUFFER;
	}

	// -- gl-specific observers
	get resource() { return this.resource_; }
	get target() { return this.glTarget_; }
}
