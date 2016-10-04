// asset-image.ts - built-in and custom image loaders
// Part of Stardazed TX
// (c) 2016 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed-tx

/// <reference path="asset.ts" />

namespace sd.asset {

	function assetGroupForImage(image: ImageData | HTMLImageElement) {
		const ag = new AssetGroup();

		ag.addTexture({
			name: name,
			descriptor: render.makeTexDesc2DFromImageSource(image)
		});

		return ag;
	}


	export function loadImageURL(url: URL, mimeType?: string): Promise<ImageData | HTMLImageElement> {
		if (! mimeType) {
			const extension = fileExtensionOfURL(url);
			mimeType = mimeTypeForFileExtension(extension);
		}
		if (! mimeType) {
			return Promise.reject(`Cannot determine mime-type of '${url}'`);
		}

		const loader = urlLoaderForMIMEType(mimeType);
		if (! loader) {
			return Promise.reject(`No buffer loader available for mime-type '${mimeType}'`);
		}
		else {
			return loader(url, mimeType).then(group => {
				const tex = group.textures[0];
				if (tex && tex.descriptor && tex.descriptor.pixelData && (tex.descriptor.pixelData.length === 1)) {
					return tex.descriptor.pixelData[0];
				}
				else {
					throw new Error("Internal error in image loader.");
				}
			});
		}
	}


	export function loadImageFromBuffer(buffer: ArrayBuffer, mimeType: string): Promise<ImageData | HTMLImageElement> {
		const loader = bufferLoaderForMIMEType(mimeType);
		if (! loader) {
			return Promise.reject(`No buffer loader available for mime-type '${mimeType}'`);
		}
		else {
			return loader(buffer, mimeType).then(group => {
				const tex = group.textures[0];
				if (tex && tex.descriptor && tex.descriptor.pixelData && (tex.descriptor.pixelData.length === 1)) {
					return tex.descriptor.pixelData[0];
				}
				else {
					throw new Error("Internal error in image loader.");
				}
			});
		}
	}


	//  ___      _ _ _       _      
	// | _ )_  _(_) | |_ ___(_)_ _  
	// | _ \ || | | |  _|___| | ' \ 
	// |___/\_,_|_|_|\__|   |_|_||_|
	//                              

	export function loadBuiltInImageFromURL(url: URL) {
		return new Promise<HTMLImageElement>(function(resolve, reject) {
			const image = new Image();
			image.onload = () => {
				resolve(image);
			};
			image.onerror = () => {
				reject(url.href + " doesn't exist or is not supported");
			};

			// When requesting cross-domain media, always try the CORS route
			// GL will not allow tainted data to be loaded so if it fails, we can't use the image anyway
			if (url.origin !== location.origin) {
				image.crossOrigin = "anonymous";
			}
			image.src = url.href;
		});
	}


	export function loadBuiltInImageFromBuffer(buffer: ArrayBuffer, mimeType: string) {
		return new Promise<HTMLImageElement>(function(resolve, reject) {
			const blob = new Blob([buffer], { type: mimeType });

			BlobReader.readAsDataURL(blob).then(
				dataURL => {
					const img = new Image();
					img.onload = () => {
						resolve(img);
					};
					img.onerror = () => {
						reject("Bad or unsupported image data.");
					};
					img.src = dataURL;
				},
				error => {
					reject(error);
				}
			);
		});
	}


	function builtInImageLoader(source: URL | ArrayBuffer, mimeType: string) {
		const imagePromise = (source instanceof URL) ? loadBuiltInImageFromURL(source) : loadBuiltInImageFromBuffer(source, mimeType);
		return imagePromise.then(img => {
			return assetGroupForImage(img);
		});
	}

	registerFileExtension("bm", "image/bmp");
	registerFileExtension("bmp", "image/bmp");
	registerFileExtension("png", "image/png");
	registerFileExtension("jpg", "image/jpeg");
	registerFileExtension("jpeg", "image/jpeg");
	registerFileExtension("gif", "image/gif");

	registerLoadersForMIMEType("image/bmp", builtInImageLoader, builtInImageLoader);
	registerLoadersForMIMEType("image/png", builtInImageLoader, builtInImageLoader);
	registerLoadersForMIMEType("image/jpeg", builtInImageLoader, builtInImageLoader);
	registerLoadersForMIMEType("image/gif", builtInImageLoader, builtInImageLoader);


	//  _____ ___   _   
	// |_   _/ __| /_\  
	//   | || (_ |/ _ \ 
	//   |_| \___/_/ \_\
	//                  

	var nativeTGASupport: boolean | null = null;

	function checkNativeTGASupport(): Promise<boolean> {
		if (nativeTGASupport === null) {
			return new Promise((resolve, _) => {
				var img = new Image();
				img.onload = () => { nativeTGASupport = true; resolve(true); };
				img.onerror = () => { nativeTGASupport = false; resolve(false); };
				img.src = "data:image/tga;base64,AAACAAAAAAAAAAAAAQABABgA////";
			});
		}

		return Promise.resolve(nativeTGASupport);
	}


	const enum TGAImageType /* uint8 */ {
		None = 0,
		Paletted = 1,
		RGB = 2,
		Grayscale = 3,

		RLEBit = 8,
		CompressedBit = 32
	}

	/*
		struct TGAFileHeader {
		0	uint8  identLengthUnused;
		1	uint8  usePalette;
		2	TGAImageType imageType;
		3	uint16 firstPaletteIndex;
		5	uint16 paletteEntryCount;
		7	uint8  paletteBits;
		8	uint16 originX;
		10	uint16 originY;
		12	uint16 width;
		14	uint16 height;
		16	uint8  bitDepth;
		17	uint8  flagsUnused;
		} __attribute__((__packed__));
	*/
	
	export function loadTGAImageFromBuffer(buffer: ArrayBuffer): ImageData {
		var headerView = new DataView(buffer, 0, 18);
		var bytesPerPixel = 0;

		var identLengthUnused = headerView.getUint8(0);
		var usePalette = headerView.getUint8(1);
		var imageType: TGAImageType = headerView.getUint8(2);

		// -- we only support a subset of TGA image types, namely those used in game pipelines
		assert(identLengthUnused === 0, "Unsupported TGA format.");
		assert(usePalette === 0, "Paletted TGA images are not supported.")
		assert((imageType & TGAImageType.CompressedBit) === 0, "Compressed TGA images are not supported.");

		var width = headerView.getUint16(12, true);
		var height = headerView.getUint16(14, true);
		var bitDepth = headerView.getUint8(16);

		if ((imageType & 7) == TGAImageType.RGB) {
			if (bitDepth == 24) {
				bytesPerPixel = 3;
			}
			else if (bitDepth == 32) {
				bytesPerPixel = 4;
			}
			else {
				throw new Error("Only 24 or 32 bit RGB TGA images are supported.");
			}
		}
		else if ((imageType & 7) == TGAImageType.Grayscale) {
			bytesPerPixel = 1;
			assert(bitDepth === 8, "Only 8-bit grayscale TGA images are supported.");
		}
		else {
			throw new Error("Unknown or inconsistent TGA image type");
		}

		var tempCanvas = document.createElement("canvas");
		var imageData = tempCanvas.getContext("2d")!.createImageData(width, height);
		var sourcePixels = new Uint8ClampedArray(buffer, 18);
		var destPixels = imageData.data;
		var pixelCount = width * height;
		var sourceOffset = 0;
		var destOffset = (height - 1) * width * 4;
		var pixelRunLeft = imageType & TGAImageType.RLEBit ? 0 : pixelCount;
		var pixelRunRaw = true;
		var linePixelsLeft = width;

		if (bytesPerPixel == 1) {
			// 8-bit Grayscale pixels
			while (pixelCount > 0) {
				if (pixelRunLeft == 0) {
					let ctrl = sourcePixels[sourceOffset];
					pixelRunRaw = (ctrl & 0x80) == 0;
					pixelRunLeft = 1 + (ctrl & 0x7f);
					sourceOffset += 1;
				}

				var gray = sourcePixels[sourceOffset];
				destPixels[destOffset]     = gray;
				destPixels[destOffset + 1] = gray;
				destPixels[destOffset + 2] = gray;
				destPixels[destOffset + 3] = 255;

				pixelRunLeft -= 1;
				pixelCount -= 1;
				if (pixelRunRaw || pixelRunLeft == 0) {
					sourceOffset += 1;
				}
				destOffset += 4;
				linePixelsLeft -= 1;
				if (linePixelsLeft == 0) {
					destOffset -= 2 * width * 4;
					linePixelsLeft = width;
				}
			}
		}
		else if (bytesPerPixel == 3) {
			// 24-bit BGR pixels
			while (pixelCount > 0) {
				if (pixelRunLeft == 0) {
					let ctrl = sourcePixels[sourceOffset];
					pixelRunRaw = (ctrl & 0x80) == 0;
					pixelRunLeft = 1 + (ctrl & 0x7f);
					sourceOffset += 1;
				}
				
				destPixels[destOffset] = sourcePixels[sourceOffset + 2];
				destPixels[destOffset + 1] = sourcePixels[sourceOffset + 1];
				destPixels[destOffset + 2] = sourcePixels[sourceOffset];
				destPixels[destOffset + 3] = 255;

				pixelRunLeft -= 1;
				pixelCount -= 1;
				if (pixelRunRaw || pixelRunLeft == 0) {
					sourceOffset += 3;
				}
				destOffset += 4;
				linePixelsLeft -= 1;
				if (linePixelsLeft == 0) {
					destOffset -= 2 * width * 4;
					linePixelsLeft = width;
				}
			}
		}
		else if (bytesPerPixel == 4) {
			// 32-bit BGRA pixels
			while (pixelCount > 0) {
				if (pixelRunLeft == 0) {
					let ctrl = sourcePixels[sourceOffset];
					pixelRunRaw = (ctrl & 0x80) == 0;
					pixelRunLeft = 1 + (ctrl & 0x7f);
					sourceOffset += 1;
				}
				
				destPixels[destOffset] = sourcePixels[sourceOffset + 2];
				destPixels[destOffset + 1] = sourcePixels[sourceOffset + 1];
				destPixels[destOffset + 2] = sourcePixels[sourceOffset];
				destPixels[destOffset + 3] = sourcePixels[sourceOffset + 3];

				pixelRunLeft -= 1;
				pixelCount -= 1;
				if (pixelRunRaw || pixelRunLeft == 0) {
					sourceOffset += 4;
				}
				destOffset += 4;
				linePixelsLeft -= 1;
				if (linePixelsLeft == 0) {
					destOffset -= 2 * width * 4;
					linePixelsLeft = width;
				}
			}
		}

		return imageData;		
	}


	export function tgaLoader(source: URL | ArrayBuffer, _mimeType: string) {
		if (source instanceof URL) {
			return checkNativeTGASupport().then(supported => {
				if (supported) {
					return loadBuiltInImageFromURL(source).then(image => {
						return assetGroupForImage(image);
					});
				}
				else {
					return loadFile(source.href, { responseType: FileLoadType.ArrayBuffer }).then((buf: ArrayBuffer) => {
						return assetGroupForImage(loadTGAImageFromBuffer(buf));
					});
				}
			});
		}
		else {
			return Promise.resolve(assetGroupForImage(loadTGAImageFromBuffer(source)));
		}
	}

	registerFileExtension("tga", "image/tga");
	registerLoadersForMIMEType("image/tga", tgaLoader, tgaLoader);

} // ns sd.asset
