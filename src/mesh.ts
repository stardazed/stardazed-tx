// mesh.ts - mesh data
// Part of Stardazed TX
// (c) 2015 by Arthur Langereis - @zenmumbler

/// <reference path="../defs/gl-matrix.d.ts" />
/// <reference path="../defs/webgl-ext.d.ts" />

/// <reference path="core.ts" />
/// <reference path="game.ts" />

namespace sd.mesh {

	// -- A single field in a vertex buffer
	// -- 3 properties: element type, count and normalization

	export const enum VertexField {
		Undefined,

		// integer
		UInt8x2,
		UInt8x3,
		UInt8x4,

		SInt8x2,
		SInt8x3,
		SInt8x4,

		UInt16x2,
		UInt16x3,
		UInt16x4,

		SInt16x2,
		SInt16x3,
		SInt16x4,

		UInt32,
		UInt32x2,
		UInt32x3,
		UInt32x4,

		SInt32,
		SInt32x2,
		SInt32x3,
		SInt32x4,

		// floating point
		Float,
		Floatx2,
		Floatx3,
		Floatx4,

		// normalized
		Norm_UInt8x2 = 0x81,	// normalized fields have high bit set
		Norm_UInt8x3,
		Norm_UInt8x4,

		Norm_SInt8x2,
		Norm_SInt8x3,
		Norm_SInt8x4,

		Norm_UInt16x2,
		Norm_UInt16x3,
		Norm_UInt16x4,

		Norm_SInt16x2,
		Norm_SInt16x3,
		Norm_SInt16x4
	};


	// --- VertexField traits

	export function vertexFieldElementCount(vf: VertexField) {
		switch (vf) {
			case VertexField.Undefined:
				return 0;

			case VertexField.UInt32:
			case VertexField.SInt32:
			case VertexField.Float:
				return 1;

			case VertexField.UInt8x2:
			case VertexField.Norm_UInt8x2:
			case VertexField.SInt8x2:
			case VertexField.Norm_SInt8x2:
			case VertexField.UInt16x2:
			case VertexField.Norm_UInt16x2:
			case VertexField.SInt16x2:
			case VertexField.Norm_SInt16x2:
			case VertexField.UInt32x2:
			case VertexField.SInt32x2:
			case VertexField.Floatx2:
				return 2;

			case VertexField.UInt8x3:
			case VertexField.Norm_UInt8x3:
			case VertexField.SInt8x3:
			case VertexField.Norm_SInt8x3:
			case VertexField.UInt16x3:
			case VertexField.Norm_UInt16x3:
			case VertexField.SInt16x3:
			case VertexField.Norm_SInt16x3:
			case VertexField.UInt32x3:
			case VertexField.SInt32x3:
			case VertexField.Floatx3:
				return 3;

			case VertexField.UInt8x4:
			case VertexField.Norm_UInt8x4:
			case VertexField.SInt8x4:
			case VertexField.Norm_SInt8x4:
			case VertexField.UInt16x4:
			case VertexField.Norm_UInt16x4:
			case VertexField.SInt16x4:
			case VertexField.Norm_SInt16x4:
			case VertexField.UInt32x4:
			case VertexField.SInt32x4:
			case VertexField.Floatx4:
				return 4;
		}
	}


	export function vertexFieldElementSizeBytes(vf: VertexField) {
		switch (vf) {
			case VertexField.Undefined:
				return 0;

			case VertexField.Float:
			case VertexField.Floatx2:
			case VertexField.Floatx3:
			case VertexField.Floatx4:
			case VertexField.UInt32:
			case VertexField.SInt32:
			case VertexField.UInt32x2:
			case VertexField.SInt32x2:
			case VertexField.UInt32x3:
			case VertexField.SInt32x3:
			case VertexField.UInt32x4:
			case VertexField.SInt32x4:
				return 4;

			case VertexField.UInt16x2:
			case VertexField.Norm_UInt16x2:
			case VertexField.SInt16x2:
			case VertexField.Norm_SInt16x2:
			case VertexField.UInt16x3:
			case VertexField.Norm_UInt16x3:
			case VertexField.SInt16x3:
			case VertexField.Norm_SInt16x3:
			case VertexField.UInt16x4:
			case VertexField.Norm_UInt16x4:
			case VertexField.SInt16x4:
			case VertexField.Norm_SInt16x4:
				return 2;

			case VertexField.UInt8x2:
			case VertexField.Norm_UInt8x2:
			case VertexField.SInt8x2:
			case VertexField.Norm_SInt8x2:
			case VertexField.UInt8x3:
			case VertexField.Norm_UInt8x3:
			case VertexField.SInt8x3:
			case VertexField.Norm_SInt8x3:
			case VertexField.UInt8x4:
			case VertexField.Norm_UInt8x4:
			case VertexField.SInt8x4:
			case VertexField.Norm_SInt8x4:
				return 1;
		}
	}


	export function vertexFieldSizeBytes(vf: VertexField) {
		return vertexFieldElementSizeBytes(vf) * vertexFieldElementCount(vf);
	}


	export function vertexFieldIsNormalized(vf: VertexField) {
		return (vf & 0x80) != 0;
	}


	export const enum VertexAttributeRole {
		Generic,
		Position,
		Normal,
		Tangent,
		Colour,
		UV,
		UVW,
		Index
	};

	// -- A VertexAttribute is a Field with a certain Role inside a VertexBuffer

	export class VertexAttribute {
		field: VertexField = VertexField.Undefined;
		role: VertexAttributeRole = VertexAttributeRole.Generic;
	}


	export function maxVertexAttributes() {
		// FIXME - this is the mandated minimum for GL 4.4
		// may want to up this to 32 and limit actual usage based on
		// runtime reported maximum (GL_MAX_VERTEX_ATTRIBS)
		return 16;
	}


	// -- VertexAttribute shortcuts for common types

	export function attrPosition3(): VertexAttribute { return { field: VertexField.Floatx3, role: VertexAttributeRole.Position }; }
	export function attrNormal3(): VertexAttribute { return { field: VertexField.Floatx3, role: VertexAttributeRole.Normal }; }
	export function attrColour3(): VertexAttribute { return { field: VertexField.Floatx3, role: VertexAttributeRole.Colour }; }
	export function attrUV2(): VertexAttribute { return { field: VertexField.Floatx2, role: VertexAttributeRole.UV }; }
	export function attrTangent4(): VertexAttribute { return { field: VertexField.Floatx4, role: VertexAttributeRole.Tangent }; }


	// -- Common AttributeList shortcuts

	export namespace AttrList {
		export function Pos3Norm3(): VertexAttribute[] {
			return [ attrPosition3(), attrNormal3() ];
		}
		export function Pos3Norm3UV2(): VertexAttribute[] {
			return [ attrPosition3(), attrNormal3(), attrUV2() ];
		}
		export function Pos3Norm3UV2Tan4(): VertexAttribute[] {
			return [ attrPosition3(), attrNormal3(), attrUV2(), attrTangent4() ];
		}
	}


	export class PositionedAttribute extends VertexAttribute {
		offset: number;

		constructor(vf: VertexField, ar: VertexAttributeRole, offset: number);
		constructor(attr: VertexAttribute, offset: number);
		constructor(fieldOrAttr: VertexField | VertexAttribute, roleOrOffset: VertexAttribute | number, offset?: number) {
			super();

			if (fieldOrAttr instanceof VertexAttribute) {
				this.field = fieldOrAttr.field;
				this.role = fieldOrAttr.role;
				this.offset = <number>roleOrOffset;
			}
			else {
				this.field = <VertexField>fieldOrAttr;
				this.role = <VertexAttributeRole>roleOrOffset;
				this.offset = offset;
			}
		}
	}


	function alignFieldOnSize(size: number, offset: number) {
		// FIXME: this will fail if size is not a power of 2
		// extend to nearest power of 2, then - 1
		var mask = size - 1;
		return (offset + mask) & ~mask;
	}


	function alignVertexField(field: VertexField, offset: number) {
		return alignFieldOnSize(vertexFieldElementSizeBytes(field), offset);
	}


	// __   __       _           _                       _   
	// \ \ / /__ _ _| |_ _____ _| |   __ _ _  _ ___ _  _| |_ 
	//  \ V / -_) '_|  _/ -_) \ / |__/ _` | || / _ \ || |  _|
	//   \_/\___|_|  \__\___/_\_\____\__,_|\_, \___/\_,_|\__|
	//                                     |__/              

	export class VertexLayout {
		private attributeCount_ = 0;
		private vertexSizeBytes_ = 0;
		private attrs_: PositionedAttribute[];

		constructor(attrList: VertexAttribute[]) {
			this.attributeCount_ = attrList.length;
			assert(this.attributeCount_ <= maxVertexAttributes());

			var offset = 0, maxElemSize = 0;

			// calculate positioning of successive attributes in linear item
			this.attrs_ = attrList.map((attr: VertexAttribute): PositionedAttribute => {
				var size = vertexFieldSizeBytes(attr.field);
				maxElemSize = Math.max(maxElemSize, vertexFieldElementSizeBytes(attr.field));

				var alignedOffset = alignVertexField(attr.field, offset);
				offset = alignedOffset + size;
				return new PositionedAttribute(attr, alignedOffset);
			});

			// align full item size on boundary of biggest element in attribute list, with min of float boundary
			maxElemSize = Math.max(Float32Array.BYTES_PER_ELEMENT, maxElemSize);
			this.vertexSizeBytes_ = alignFieldOnSize(maxElemSize, offset);
		}

		attributeCount() { return this.attributeCount_; }
		vertexSizeBytes() { return this.vertexSizeBytes_; }
	
		bytesRequiredForVertexCount(vertexCount: number): number {
			return vertexCount * this.vertexSizeBytes();
		}
	
		attrByRole(role: VertexAttributeRole): PositionedAttribute {
			return this.attrs_.find((pa) => pa.role == role);
		}

		attrByIndex(index: number): PositionedAttribute {
			return this.attrs_[index];
		}

		hasAttributeWithRole(role: VertexAttributeRole): boolean {
			return this.attrByRole(role) != null;
		}
	}


	// __   __       _           ___       __  __         
	// \ \ / /__ _ _| |_ _____ _| _ )_  _ / _|/ _|___ _ _ 
	//  \ V / -_) '_|  _/ -_) \ / _ \ || |  _|  _/ -_) '_|
	//   \_/\___|_|  \__\___/_\_\___/\_,_|_| |_| \___|_|  
	//	

	class VertexBuffer {
		private layout_: VertexLayout;
		private itemCount_ = 0;
		private storage_: ArrayBuffer = null;

		constructor(attrs: VertexAttribute[] | VertexLayout) {
			if (attrs instanceof VertexLayout)
				this.layout_ = attrs;
			else
				this.layout_ = new VertexLayout(<VertexAttribute[]>attrs);
		}

		// -- buffer data management

		layout() { return this.layout_; }
		strideBytes() { return this.layout_.vertexSizeBytes(); }
		attributeCount() { return this.layout_.attributeCount(); }
		itemCount() { return this.itemCount_; }
		bufferSizeBytes() { return this.strideBytes() * this.itemCount_; }

		allocate(itemCount: number) {
			this.itemCount_ = itemCount;
			this.storage_ = new ArrayBuffer(this.layout_.bytesRequiredForVertexCount(itemCount));
		}
	
		// -- raw data pointers

		buffer() { return this.storage_; }	

		// -- attribute access pass-through
	
		hasAttributeWithRole(role: VertexAttributeRole) {
			return this.layout_.hasAttributeWithRole(role);
		}
		attrByRole(role: VertexAttributeRole) {
			return this.layout_.attrByRole(role);
		}
		attrByIndex(index: number) {
			return this.layout_.attrByIndex(index);
		}

		// -- iteration over attribute data

		// TODO: implement (needs analog of STLBasicBufferIterator)
	}


	//  ___         _         ___       __  __         
	// |_ _|_ _  __| |_____ _| _ )_  _ / _|/ _|___ _ _ 
	//  | || ' \/ _` / -_) \ / _ \ || |  _|  _/ -_) '_|
	// |___|_||_\__,_\___/_\_\___/\_,_|_| |_| \___|_|  
	//                                                

	export const enum IndexElementType {
		UInt8,
		UInt16,
		UInt32
	}


	export const enum PrimitiveType {
		Point,
		Line,
		LineStrip,
		Triangle,
		TriangleStrip
	}


	export function indexElementTypeSizeBytes(iet: IndexElementType): number {
		switch (iet) {
			case IndexElementType.UInt8: return Uint8Array.BYTES_PER_ELEMENT;
			case IndexElementType.UInt16: return Uint16Array.BYTES_PER_ELEMENT;
			case IndexElementType.UInt32: return Uint32Array.BYTES_PER_ELEMENT;
		}
	}


	export function minimumIndexElementTypeForVertexCount(vertexCount: number): IndexElementType {
		if (vertexCount <= sd.NumericLimits.UInt8.max)
			return IndexElementType.UInt8;
		if (vertexCount <= sd.NumericLimits.UInt16.max)
			return IndexElementType.UInt16;

		return IndexElementType.UInt32;
	}


	export class IndexBuffer {
		private primitiveType_ = PrimitiveType.Point;
		private indexElementType_ = IndexElementType.UInt8;
		private indexCount_ = 0;
		private primitiveCount_ = 0;
		private indexElementSizeBytes_ = 0;
		private storage_: ArrayBuffer = null;

		allocate(primitiveType: PrimitiveType, elementType: IndexElementType, primitiveCount: number) {
			this.primitiveType_ = primitiveType;
			this.indexElementType_ = elementType;
			this.indexElementSizeBytes_ = indexElementTypeSizeBytes(this.indexElementType_);
			this.primitiveCount_ = primitiveCount;

			switch (primitiveType) {
				case PrimitiveType.Point:
					this.indexCount_ = primitiveCount;
					break;
				case PrimitiveType.Line:
					this.indexCount_ = primitiveCount * 2;
					break;
				case PrimitiveType.LineStrip:
					this.indexCount_ = primitiveCount + 1;
					break;
				case PrimitiveType.Triangle:
					this.indexCount_ = primitiveCount * 3;
					break;
				case PrimitiveType.TriangleStrip:
					this.indexCount_ = primitiveCount + 2;
					break;
			}

			this.storage_ = new ArrayBuffer(this.bufferSizeBytes());
		}

		// -- observers
		primitiveType() { return this.primitiveType_; }
		indexElementType() { return this.indexElementType_; }

		primitiveCount() { return this.primitiveCount_; }
		indexCount() { return this.indexCount_; }
		indexElementSizeBytes() { return this.indexElementSizeBytes_; }

		bufferSizeBytes() { return this.indexCount() * this.indexElementSizeBytes(); }
		buffer() { return this.storage_; }

		// -- read/write indexes
		private typedBasePtr(baseIndexNr: number): Uint32Array | Uint16Array | Uint8Array {
			var offsetBytes = this.indexElementSizeBytes() * baseIndexNr;

			if (this.indexElementType() == IndexElementType.UInt32) {
				return new Uint32Array(this.storage_, offsetBytes);
			}
			else if (this.indexElementType() == IndexElementType.UInt16) {
				return new Uint16Array(this.storage_, offsetBytes);
			}
			else {
				return new Uint8Array(this.storage_, offsetBytes);
			}
		}

		indexes(baseIndexNr: number, outputCount: number, outputPtr: Uint32Array) {
			assert(baseIndexNr < this.indexCount());
			assert(baseIndexNr + outputCount < this.indexCount());
			assert(outputPtr.length >= outputCount);

			var typedBasePtr = this.typedBasePtr(baseIndexNr);

			for (let ix = 0; ix < outputCount; ++ix) {
				outputPtr[ix] = typedBasePtr[ix];
			}
		}

		index(indexNr: number): number {
			var typedBasePtr = this.typedBasePtr(indexNr);
			return typedBasePtr[0];
		}

		setIndexes(baseIndexNr: number, sourceCount: number, sourcePtr: Uint32Array) {
			assert(baseIndexNr < this.indexCount());
			assert(baseIndexNr + sourceCount < this.indexCount());
			assert(sourcePtr.length >= sourceCount);

			var typedBasePtr = this.typedBasePtr(baseIndexNr);

			for (let ix = 0; ix < sourceCount; ++ix) {
				typedBasePtr[ix] = sourcePtr[ix];
			}
		}

		setIndex(indexNr: number, newValue: number) {
			var typedBasePtr = this.typedBasePtr(indexNr);
			typedBasePtr[0] = newValue;
		}
	}

} // ns sd.mesh
