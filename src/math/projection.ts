// projection - simple projection structs and utils
// Part of Stardazed TX
// (c) 2015-2016 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed-tx

import { Float4x4 } from "math/primarray";

export interface ProjectionSetup {
	projectionMatrix: Float4x4;
	viewMatrix: Float4x4;
}

export interface FieldOfViewDegrees {
	upDegrees: number;
	downDegrees: number;
	leftDegrees: number;
	rightDegrees: number;
}

/*

TODO: this was going to be used somewhere

interface Projection {
	matrix: Float4x4;
	planes: math.Plane[];
}


class PerspectiveProjection {
	matrix: Float4x4;

}
*/
