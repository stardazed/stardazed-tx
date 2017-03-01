// render/framebuffer-desc - descriptors and enums related to FrameBuffer objects
// Part of Stardazed
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed

namespace sd.render {

	export interface AttachmentDescriptor {
		texture: Texture | null;
		level: number; // mipmap
		layer: number | CubeMapFace; // TexCube only: 0..5
	}


	export interface FrameBufferDescriptor {
		colourAttachments: AttachmentDescriptor[];
		depthAttachment: AttachmentDescriptor;
		stencilAttachment: AttachmentDescriptor;
	}


	// This structure facilitates easy creation of all required
	// textures for a FrameBuffer in case they need to be allocated anyway
	// The implementation is free to allocate the textures as fit for the
	// platform (2D array, multiple 2D textures, etc.) so no assumptions should
	// be made about the type or organization of the textures.

	export interface FrameBufferAllocationDescriptor {
		// properties shared by all textures for the FrameBuffer
		width: number;
		height: number;

		colourPixelFormats: image.PixelFormat[];

		// The implementation may create a combined depth/stencil texture if it
		// fits the profile of the provided texture formats, or you can make it
		// explicit by setting both to the same DepthStencil PixelFormat.
		depthPixelFormat: image.PixelFormat;
		stencilPixelFormat: image.PixelFormat;
	}


	export function makeAttachmentDescriptor(texture?: Texture, level?: number, layer?: number): AttachmentDescriptor {
		return {
			texture: texture || null,
			level: level! | 0,
			layer: layer! | 0
		};
	}


	export function makeFrameBufferDescriptor(): FrameBufferDescriptor {
		const cad: AttachmentDescriptor[] = [];
		for (let k = 0; k < 8; ++k) {
			cad.push(makeAttachmentDescriptor());
		}
		Object.seal(cad); // fixed length array

		return {
			colourAttachments: cad,
			depthAttachment: makeAttachmentDescriptor(),
			stencilAttachment: makeAttachmentDescriptor()
		};
	}


	export function makeFrameBufferAllocationDescriptor(numColourAttachments: number): FrameBufferAllocationDescriptor {
		const apf: image.PixelFormat[] = [];
		for (let k = 0; k < 8; ++k) {
			// set default pixelformat for requested colour attachments to RGBA8
			apf.push((k < numColourAttachments) ? image.PixelFormat.RGBA8 : image.PixelFormat.None);
		}
		Object.seal(apf); // fixed length arrays

		return {
			width: 0,
			height: 0,

			colourPixelFormats: apf,

			depthPixelFormat: image.PixelFormat.None,
			stencilPixelFormat: image.PixelFormat.None
		};
	}

} // ns sd.render
