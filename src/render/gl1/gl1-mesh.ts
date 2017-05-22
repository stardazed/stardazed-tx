// render/gl1/mesh - WebGL1 implementation of mesh resources
// Part of Stardazed
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed

namespace sd.render.gl1 {
	/*
	function gl1TypeForIndexElementType(rd: GL1RenderDevice, iet: meshdata.IndexElementType): number {
		switch (iet) {
			case meshdata.IndexElementType.UInt8: return rd.gl.UNSIGNED_BYTE;
			case meshdata.IndexElementType.UInt16: return rd.gl.UNSIGNED_SHORT;
			case meshdata.IndexElementType.UInt32:
				return rd.ext32bitIndexes ? rd.gl.UNSIGNED_INT : rd.gl.NONE;

			default:
				assert(false, "Invalid IndexElementType");
				return rd.gl.NONE;
		}
	}
	*/

	function gl1TypeForVertexField(rc: GL1RenderDevice, vf: meshdata.VertexField) {
		switch (vf) {
			case meshdata.VertexField.Float:
			case meshdata.VertexField.Floatx2:
			case meshdata.VertexField.Floatx3:
			case meshdata.VertexField.Floatx4:
				return rc.gl.FLOAT;

			case meshdata.VertexField.UInt32:
			case meshdata.VertexField.UInt32x2:
			case meshdata.VertexField.UInt32x3:
			case meshdata.VertexField.UInt32x4:
				return rc.gl.UNSIGNED_INT;

			case meshdata.VertexField.SInt32:
			case meshdata.VertexField.SInt32x2:
			case meshdata.VertexField.SInt32x3:
			case meshdata.VertexField.SInt32x4:
				return rc.gl.INT;

			case meshdata.VertexField.UInt16x2:
			case meshdata.VertexField.Norm_UInt16x2:
			case meshdata.VertexField.UInt16x3:
			case meshdata.VertexField.Norm_UInt16x3:
			case meshdata.VertexField.UInt16x4:
			case meshdata.VertexField.Norm_UInt16x4:
				return rc.gl.UNSIGNED_SHORT;

			case meshdata.VertexField.SInt16x2:
			case meshdata.VertexField.Norm_SInt16x2:
			case meshdata.VertexField.SInt16x3:
			case meshdata.VertexField.Norm_SInt16x3:
			case meshdata.VertexField.SInt16x4:
			case meshdata.VertexField.Norm_SInt16x4:
				return rc.gl.SHORT;

			case meshdata.VertexField.UInt8x2:
			case meshdata.VertexField.Norm_UInt8x2:
			case meshdata.VertexField.UInt8x3:
			case meshdata.VertexField.Norm_UInt8x3:
			case meshdata.VertexField.UInt8x4:
			case meshdata.VertexField.Norm_UInt8x4:
				return rc.gl.UNSIGNED_BYTE;

			case meshdata.VertexField.SInt8x2:
			case meshdata.VertexField.Norm_SInt8x2:
			case meshdata.VertexField.SInt8x3:
			case meshdata.VertexField.Norm_SInt8x3:
			case meshdata.VertexField.SInt8x4:
			case meshdata.VertexField.Norm_SInt8x4:
				return rc.gl.BYTE;

			default:
				assert(false, "Invalid mesh.VertexField");
				return rc.gl.NONE;
		}
	}

	const shaderRoleToAttributeRole: { [rr: string]: meshdata.VertexAttributeRole } = {
		position: meshdata.VertexAttributeRole.Position,
		normal: meshdata.VertexAttributeRole.Normal,
		tangent: meshdata.VertexAttributeRole.Tangent,
		colour: meshdata.VertexAttributeRole.Colour,
		material: meshdata.VertexAttributeRole.Material,
		uv0: meshdata.VertexAttributeRole.UV0,
		uv1: meshdata.VertexAttributeRole.UV1,
		uv2: meshdata.VertexAttributeRole.UV2,
		uv3: meshdata.VertexAttributeRole.UV3,
		weightedPos0: meshdata.VertexAttributeRole.WeightedPos0,
		weightedPos1: meshdata.VertexAttributeRole.WeightedPos1,
		weightedPos2: meshdata.VertexAttributeRole.WeightedPos2,
		weightedPos3: meshdata.VertexAttributeRole.WeightedPos3,
		jointIndexes: meshdata.VertexAttributeRole.JointIndexes
	};


	export interface GL1MeshData {
		attributes: meshdata.PositionedAttribute[];
		indexElement: meshdata.IndexElementType;
		buffers: WebGLBuffer[];
		bufferStrides: number[];
		vaos: Map<string, WebGLVertexArrayObjectOES>;
	}


	export function makeMesh(rd: GL1RenderDevice, mesh: meshdata.MeshData): GL1MeshData {
		const gl = rd.gl;
		const buffers: WebGLBuffer[] = [];

		// Even though the local vertex and index buffers may all be allocated in a single
		// array, WebGL does not support binding the same ArrayBuffer to different targets
		// for safety reasons.
		for (const vb of mesh.vertexBuffers) {
			const vbuf = gl.createBuffer()!; // TODO: handle allocation failure
			gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
			gl.bufferData(gl.ARRAY_BUFFER, vb.storage, gl.STATIC_DRAW);
			buffers.push(vbuf);
		}

		// The index buffer, if present, is the last buffer in the array
		if (mesh.indexBuffer) {
			const ibuf = gl.createBuffer()!; // TODO: handle allocation failure
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer.storage, gl.STATIC_DRAW);
			buffers.push(ibuf);
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

		// linearize the attributes and store all required data for this mesh to be bound
		return {
			attributes: mesh.layout.layouts.map(vbl => vbl.attributes).reduce((aa, next) => aa.concat(next)),
			indexElement: mesh.indexBuffer ? mesh.indexBuffer.indexElementType : meshdata.IndexElementType.None,
			buffers,
			bufferStrides: mesh.layout.layouts.map(vbl => vbl.stride),
			vaos: new Map<string, WebGLVertexArrayObjectOES>()
		};
	}


	function createVAOForAttrBinding(rd: GL1RenderDevice, meshHandle: number, attrs: ShaderVertexAttribute[]) {
		const gl = rd.gl;

		const mesh = rd.meshes_.getByHandle(meshHandle)!; // assert presence
		const vao = rd.extVAO.createVertexArrayOES()!; // TODO: handle allocation failure
		rd.extVAO.bindVertexArrayOES(vao);

		// -- find and bind all attributes
		for (let bufferIndex = 0; bufferIndex < mesh.layout.layouts.length; ++bufferIndex) {
			const layout = mesh.layout.layouts[bufferIndex];
			const vb = mesh.buffers[bufferIndex];
			gl.bindBuffer(gl.ARRAY_BUFFER, vb);

			for (const sva of attrs) {
				const va = layout.attrByRole(shaderRoleToAttributeRole[sva.role]);
				if (va) {
					const elementCount = meshdata.vertexFieldElementCount(va.field);
					const normalized = meshdata.vertexFieldIsNormalized(va.field);
					const glElementType = gl1TypeForVertexField(rd, va.field);

					gl.enableVertexAttribArray(sva.index);
					gl.vertexAttribPointer(sva.index, elementCount, glElementType, normalized, layout.stride, va.offset);
				}
			}
		}

		// -- bind optional indexes
		if (mesh.indexBuffer) {
			const ib = rd.indexStreams_.find(mesh.indexBuffer)!;
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
		}
		else {
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		}

		rd.extVAO.bindVertexArrayOES(null);
		return vao;
	}


	export function bindMesh(rd: GL1RenderDevice, meshHandle: number, attrs: ShaderVertexAttribute[]) {
		
	}

} // ns sd.render.gl1
