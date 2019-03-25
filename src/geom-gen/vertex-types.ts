/**
 * geometry-gen/vertex-types - shortcuts to define vertex attributes
 * Part of Stardazed
 * (c) 2015-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/stardazed
 */

namespace sd.asset {

// -- VertexAttribute shortcuts for common types

export function attrPosition2(): VertexAttribute { return { field: VertexField.Floatx2, role: VertexAttributeRole.Position }; }
export function attrPosition3(): VertexAttribute { return { field: VertexField.Floatx3, role: VertexAttributeRole.Position }; }
export function attrNormal3(): VertexAttribute { return { field: VertexField.Floatx3, role: VertexAttributeRole.Normal }; }
export function attrColour3(): VertexAttribute { return { field: VertexField.Floatx3, role: VertexAttributeRole.Colour }; }
export function attrUV2(): VertexAttribute { return { field: VertexField.Floatx2, role: VertexAttributeRole.UV }; }
export function attrTangent3(): VertexAttribute { return { field: VertexField.Floatx3, role: VertexAttributeRole.Tangent }; }

export function attrJointIndexes(): VertexAttribute { return { field: VertexField.SInt32x4, role: VertexAttributeRole.JointIndexes }; }

/**
 * @expects index >= 0 && index < 4
 */
export function attrWeightedPos(index: number) {
	return { field: VertexField.Floatx4, role: VertexAttributeRole.WeightedPos0 + index };
}


// -- Common AttributeList shortcuts

export namespace AttrList {
	export function Pos3Norm3(): VertexAttribute[] {
		return [attrPosition3(), attrNormal3()];
	}
	export function Pos3Norm3Colour3() {
		return [attrPosition3(), attrNormal3(), attrColour3()];
	}
	export function Pos3Norm3UV2(): VertexAttribute[] {
		return [attrPosition3(), attrNormal3(), attrUV2()];
	}
	export function Pos3Norm3Colour3UV2() {
		return [attrPosition3(), attrNormal3(), attrColour3(), attrUV2()];
	}
	export function Pos3Norm3UV2Tan3(): VertexAttribute[] {
		return [attrPosition3(), attrNormal3(), attrUV2(), attrTangent3()];
	}
}

} // ns sd.asset