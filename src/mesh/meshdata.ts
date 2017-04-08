// meshdata/meshdata - mesh data
// Part of Stardazed
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed

namespace sd.meshdata {

	//  __  __        _    ___       _
	// |  \/  |___ __| |_ |   \ __ _| |_ __ _
	// | |\/| / -_|_-< ' \| |) / _` |  _/ _` |
	// |_|  |_\___/__/_||_|___/\__,_|\__\__,_|
	//

	export interface SubMesh {
		type: meshdata.PrimitiveType;
		fromElement: number;
		elementCount: number;
		materialIx: number; // arbitrary material index or reference; representation of Materials is external to MeshData
	}

	const enum BufferAlignment {
		SubBuffer = 8
	}

	export interface MeshDataAllocOptions {
		layout: VertexLayout;
		vertexCount: number;
		indexCount: number;
	}

	export interface MeshData extends render.RenderResourceBase {
		layout: VertexLayout;
		vertexBuffers: VertexBuffer[];
		indexBuffer?: IndexBuffer;
		subMeshes: SubMesh[];
	}

	export function allocateMeshData(options: MeshDataAllocOptions): MeshData {
		let totalBytes = 0;
		for (let vbix = 0; vbix < options.layout.layouts.length; ++vbix) {
			totalBytes += options.layout.layouts[vbix].bytesRequiredForVertexCount(options.vertexCount);
			totalBytes = math.alignUp(totalBytes, BufferAlignment.SubBuffer);
		}
		if (options.indexCount > 0) {
			const elementType = minimumIndexElementTypeForVertexCount(options.vertexCount);
			totalBytes += bytesRequiredForIndexCount(elementType, options.indexCount);
			totalBytes = math.alignUp(totalBytes, BufferAlignment.SubBuffer);
		}

		assert(totalBytes > 0, "Nothing to allocate!");

		const md: MeshData = {
			renderResourceType: render.ResourceType.Mesh,
			renderResourceHandle: 0,
			layout: options.layout,
			vertexBuffers: [],
			subMeshes: [],
		};
		const storage = new ArrayBuffer(totalBytes);

		let byteOffset = 0;
		for (let vbix = 0; vbix < options.layout.layouts.length; ++vbix) {
			const subSize = options.layout.layouts[vbix].bytesRequiredForVertexCount(options.vertexCount);
			const subStorage = new Uint8ClampedArray(storage, byteOffset, subSize);
			const vb = new VertexBuffer(options.vertexCount, options.layout.layouts[vbix].stride, subStorage);
			md.vertexBuffers.push(vb);

			byteOffset += subSize;
			byteOffset = math.alignUp(byteOffset, BufferAlignment.SubBuffer);
		}
		if (options.indexCount) {
			const elementType = minimumIndexElementTypeForVertexCount(options.vertexCount);
			const indexSize = bytesRequiredForIndexCount(elementType, options.indexCount);
			const subSize = bytesRequiredForIndexCount(elementType, options.indexCount);
			const subStorage = new Uint8ClampedArray(storage, byteOffset, subSize);

			md.indexBuffer = new IndexBuffer(elementType, options.indexCount, subStorage);
			byteOffset += indexSize;
			byteOffset = math.alignUp(byteOffset, BufferAlignment.SubBuffer);
		}

		assert(totalBytes === byteOffset, "Mismatch of precalculated and actual buffer sizes");
		return md;
	}

	export function findAttributeOfRoleInMesh(mesh: MeshData, role: VertexAttributeRole): { vertexBuffer: VertexBuffer; attr: PositionedAttribute; } | undefined {
		const pa = findAttributeOfRoleInLayout(mesh.layout, role);
		const avb = pa ? mesh.vertexBuffers[pa.bufferIndex] : undefined;

		if (pa && avb) {
			return { vertexBuffer: avb, attr: pa };
		}
		return undefined;
	}

	// derived vertex data generation
	export function genVertexNormals(mesh: MeshData) {
		mesh.vertexBuffers.forEach((vertexBuffer, ix) => {
			if (mesh.indexBuffer) {
				calcVertexNormals(mesh.layout.layouts[ix], vertexBuffer, mesh.indexBuffer);
			}
		});
	}

} // ns sd.meshdata
