// github.com/shawn0326/three.path
import { Vector3, Matrix4, QuadraticBezierCurve3, BufferGeometry, BufferAttribute, DynamicDrawUsage, Uint32BufferAttribute, Uint16BufferAttribute, StaticDrawUsage } from 'three';

/**
 * PathPoint
 */
class PathPoint {

	constructor() {
		this.pos = new Vector3();
		this.dir = new Vector3();
		this.right = new Vector3();
		this.up = new Vector3(); // normal
		this.dist = 0; // distance from start
		this.widthScale = 1; // for corner
		this.sharp = false; // marks as sharp corner
	}

	lerpPathPoints(p1, p2, alpha) {
		this.pos.lerpVectors(p1.pos, p2.pos, alpha);
		this.dir.lerpVectors(p1.dir, p2.dir, alpha);
		this.up.lerpVectors(p1.up, p2.up, alpha);
		this.right.lerpVectors(p1.right, p2.right, alpha);
		this.dist = (p2.dist - p1.dist) * alpha + p1.dist;
		this.widthScale = (p2.widthScale - p1.widthScale) * alpha + p1.widthScale;
	}

	copy(source) {
		this.pos.copy(source.pos);
		this.dir.copy(source.dir);
		this.up.copy(source.up);
		this.right.copy(source.right);
		this.dist = source.dist;
		this.widthScale = source.widthScale;
	}

}

/**
 * PathPointList
 * input points to generate a PathPoint list
 */
class PathPointList {

	constructor() {
		this.array = []; // path point array
		this.count = 0;
	}

	/**
	 * Set points
	 * @param {Vector3[]} points key points array
	 * @param {number} cornerRadius? the corner radius. set 0 to disable round corner. default is 0.1
	 * @param {number} cornerSplit? the corner split. default is 10.
	 * @param {number} up? force up. default is auto up (calculate by tangent).
	 * @param {boolean} close? close path. default is false.
	 */
	set(points, cornerRadius = 0.1, cornerSplit = 10, up = null, close = false) {
		points = points.slice(0);

		if (points.length < 2) {
			console.warn('PathPointList: points length less than 2.');
			this.count = 0;
			return;
		}

		// Auto close
		if (close && !points[0].equals(points[points.length - 1])) {
			points.push(new Vector3().copy(points[0]));
		}

		// Generate path point list
		for (let i = 0, l = points.length; i < l; i++) {
			if (i === 0) {
				this._start(points[i], points[i + 1], up);
			} else if (i === l - 1) {
				if (close) {
					// Connect end point and start point
					this._corner(points[i], points[1], cornerRadius, cornerSplit, up);

					// Fix start point
					const dist = this.array[0].dist; // should not copy dist
					this.array[0].copy(this.array[this.count - 1]);
					this.array[0].dist = dist;
				} else {
					this._end(points[i]);
				}
			} else {
				this._corner(points[i], points[i + 1], cornerRadius, cornerSplit, up);
			}
		}
	}

	/**
	 * Get distance of this path
	 * @return {number}
	 */
	distance() {
		if (this.count > 0) {
			return this.array[this.count - 1].dist;
		}
		return 0;
	}

	_getByIndex(index) {
		if (!this.array[index]) {
			this.array[index] = new PathPoint();
		}
		return this.array[index];
	}

	_start(current, next, up) {
		this.count = 0;

		const point = this._getByIndex(this.count);

		point.pos.copy(current);
		point.dir.subVectors(next, current);

		// init start up dir
		if (up) {
			point.up.copy(up);
		} else {
			// select an initial normal vector perpendicular to the first tangent vector
			let min = Number.MAX_VALUE;
			const tx = Math.abs(point.dir.x);
			const ty = Math.abs(point.dir.y);
			const tz = Math.abs(point.dir.z);
			if (tx < min) {
				min = tx;
				point.up.set(1, 0, 0);
			}
			if (ty < min) {
				min = ty;
				point.up.set(0, 1, 0);
			}
			if (tz < min) {
				point.up.set(0, 0, 1);
			}
		}

		point.right.crossVectors(point.dir, point.up).normalize();
		point.up.crossVectors(point.right, point.dir).normalize();
		point.dist = 0;
		point.widthScale = 1;
		point.sharp = false;

		point.dir.normalize();

		this.count++;
	}

	_end(current) {
		const lastPoint = this.array[this.count - 1];
		const point = this._getByIndex(this.count);

		point.pos.copy(current);
		point.dir.subVectors(current, lastPoint.pos);
		const dist = point.dir.length();
		point.dir.normalize();

		point.up.copy(lastPoint.up); // copy last up

		const vec = helpVec3_1.crossVectors(lastPoint.dir, point.dir);
		if (vec.length() > Number.EPSILON) {
			vec.normalize();
			const theta = Math.acos(Math.min(Math.max(lastPoint.dir.dot(point.dir), -1), 1)); // clamp for floating pt errors
			point.up.applyMatrix4(helpMat4.makeRotationAxis(vec, theta));
		}

		point.right.crossVectors(point.dir, point.up).normalize();

		point.dist = lastPoint.dist + dist;
		point.widthScale = 1;
		point.sharp = false;

		this.count++;
	}

	_corner(current, next, cornerRadius, cornerSplit, up) {
		if (cornerRadius > 0 && cornerSplit > 0) {
			const lastPoint = this.array[this.count - 1];
			const curve = _getCornerBezierCurve(lastPoint.pos, current, next, cornerRadius, (this.count - 1) === 0, helpCurve);
			const samplerPoints = curve.getPoints(cornerSplit); // TODO optimize

			for (let f = 0; f < cornerSplit; f++) {
				this._sharpCorner(samplerPoints[f], samplerPoints[f + 1], up, f === 0 ? 1 : 0);
			}

			if (!samplerPoints[cornerSplit].equals(next)) {
				this._sharpCorner(samplerPoints[cornerSplit], next, up, 2);
			}
		} else {
			this._sharpCorner(current, next, up, 0, true);
		}
	}

	// dirType: 0 - use middle dir / 1 - use last dir / 2- use next dir
	_sharpCorner(current, next, up, dirType = 0, sharp = false) {
		const lastPoint = this.array[this.count - 1];
		const point = this._getByIndex(this.count);

		const lastDir = helpVec3_1.subVectors(current, lastPoint.pos);
		const nextDir = helpVec3_2.subVectors(next, current);

		const lastDirLength = lastDir.length();

		lastDir.normalize();
		nextDir.normalize();

		point.pos.copy(current);

		if (dirType === 1) {
			point.dir.copy(lastDir);
		} else if (dirType === 2) {
			point.dir.copy(nextDir);
		} else {
			point.dir.addVectors(lastDir, nextDir);
			point.dir.normalize();
		}

		if (up) {
			if (point.dir.dot(up) === 1) {
				point.right.crossVectors(nextDir, up).normalize();
			} else {
				point.right.crossVectors(point.dir, up).normalize();
			}

			point.up.crossVectors(point.right, point.dir).normalize();
		} else {
			point.up.copy(lastPoint.up);

			const vec = helpVec3_3.crossVectors(lastPoint.dir, point.dir);
			if (vec.length() > Number.EPSILON) {
				vec.normalize();
				const theta = Math.acos(Math.min(Math.max(lastPoint.dir.dot(point.dir), -1), 1)); // clamp for floating pt errors
				point.up.applyMatrix4(helpMat4.makeRotationAxis(vec, theta));
			}

			point.right.crossVectors(point.dir, point.up).normalize();
		}

		point.dist = lastPoint.dist + lastDirLength;

		const _cos = lastDir.dot(nextDir);
		point.widthScale = Math.min(1 / Math.sqrt((1 + _cos) / 2), 1.415) || 1;
		point.sharp = (Math.abs(_cos - 1) > 0.05) && sharp;

		this.count++;
	}

}

const helpVec3_1 = new Vector3();
const helpVec3_2 = new Vector3();
const helpVec3_3 = new Vector3();
const helpMat4 = new Matrix4();
const helpCurve = new QuadraticBezierCurve3();

function _getCornerBezierCurve(last, current, next, cornerRadius, firstCorner, out) {
	const lastDir = helpVec3_1.subVectors(current, last);
	const nextDir = helpVec3_2.subVectors(next, current);

	const lastDirLength = lastDir.length();
	const nextDirLength = nextDir.length();

	lastDir.normalize();
	nextDir.normalize();

	// cornerRadius can not bigger then lineDistance / 2, auto fix this
	const v0Dist = Math.min((firstCorner ? lastDirLength / 2 : lastDirLength) * 0.999999, cornerRadius);
	out.v0.copy(current).sub(lastDir.multiplyScalar(v0Dist));

	out.v1.copy(current);

	const v2Dist = Math.min(nextDirLength / 2 * 0.999999, cornerRadius);
	out.v2.copy(current).add(nextDir.multiplyScalar(v2Dist));

	return out;
}

/**
 * PathGeometry
 */
class PathGeometry extends BufferGeometry {

	/**
	 * @param {object|number} initData - If initData is number, geometry init by empty data and set it as the max vertex. If initData is Object, it contains pathPointList and options.
	 * @param {boolean} [generateUv2=false]
	 */
	constructor(initData = 3000, generateUv2 = false) {
		super();

		if (isNaN(initData)) {
			this._initByData(initData.pathPointList, initData.options, initData.usage, generateUv2);
		} else {
			this._initByMaxVertex(initData, generateUv2);
		}
	}

	_initByMaxVertex(maxVertex, generateUv2) {
		this.setAttribute('position', new BufferAttribute(new Float32Array(maxVertex * 3), 3).setUsage(DynamicDrawUsage));
		this.setAttribute('normal', new BufferAttribute(new Float32Array(maxVertex * 3), 3).setUsage(DynamicDrawUsage));
		this.setAttribute('uv', new BufferAttribute(new Float32Array(maxVertex * 2), 2).setUsage(DynamicDrawUsage));
		if (generateUv2) {
			this.setAttribute('uv2', new BufferAttribute(new Float32Array(maxVertex * 2), 2).setUsage(DynamicDrawUsage));
		}

		this.drawRange.start = 0;
		this.drawRange.count = 0;

		this.setIndex(maxVertex > 65536 ?
			new Uint32BufferAttribute(maxVertex * 3, 1) :
			new Uint16BufferAttribute(maxVertex * 3, 1)
		);
	}

	_initByData(pathPointList, options = {}, usage, generateUv2) {
		const vertexData = generatePathVertexData(pathPointList, options, generateUv2);

		if (vertexData && vertexData.count !== 0) {
			this.setAttribute('position', new BufferAttribute(new Float32Array(vertexData.position), 3).setUsage(usage || StaticDrawUsage));
			this.setAttribute('normal', new BufferAttribute(new Float32Array(vertexData.normal), 3).setUsage(usage || StaticDrawUsage));
			this.setAttribute('uv', new BufferAttribute(new Float32Array(vertexData.uv), 2).setUsage(usage || StaticDrawUsage));
			if (generateUv2) {
				this.setAttribute('uv2', new BufferAttribute(new Float32Array(vertexData.uv2), 2).setUsage(usage || StaticDrawUsage));
			}

			this.setIndex((vertexData.position.length / 3) > 65536 ?
				new Uint32BufferAttribute(vertexData.indices, 1) :
				new Uint16BufferAttribute(vertexData.indices, 1)
			);
		} else {
			this._initByMaxVertex(2, generateUv2);
		}
	}

	/**
	 * Update geometry by PathPointList instance
	 * @param {PathPointList} pathPointList
	 * @param {Object} options
	 * @param {Number} [options.width=0.1]
	 * @param {Number} [options.progress=1]
	 * @param {Boolean} [options.arrow=true]
	 * @param {String} [options.side='both'] - "left"/"right"/"both"
	 */
	update(pathPointList, options = {}) {
		const generateUv2 = !!this.getAttribute('uv2');

		const vertexData = generatePathVertexData(pathPointList, options, generateUv2);

		if (vertexData) {
			this._updateAttributes(vertexData.position, vertexData.normal, vertexData.uv, generateUv2 ? vertexData.uv2 : null, vertexData.indices);
			this.drawRange.count = vertexData.count;
		} else {
			this.drawRange.count = 0;
		}
	}

	_resizeAttribute(name, len) {
		let attribute = this.getAttribute(name);
		while (attribute.array.length < len) {
			const oldLength = attribute.array.length;
			const newAttribute = new BufferAttribute(
				new Float32Array(oldLength * 2),
				attribute.itemSize,
				attribute.normalized
			);
			newAttribute.name = attribute.name;
			newAttribute.usage = attribute.usage;
			this.setAttribute(name, newAttribute);
			attribute = newAttribute;
		}
	}

	_resizeIndex(len) {
		let index = this.getIndex();
		while (index.array.length < len) {
			const oldLength = index.array.length;
			const newIndex = new BufferAttribute(
				oldLength * 2 > 65535 ? new Uint32Array(oldLength * 2) : new Uint16Array(oldLength * 2),
				1
			);
			newIndex.name = index.name;
			newIndex.usage = index.usage;
			this.setIndex(newIndex);
			index = newIndex;
		}
	}

	_updateAttributes(position, normal, uv, uv2, indices) {
		this._resizeAttribute('position', position.length);
		const positionAttribute = this.getAttribute('position');
		positionAttribute.array.set(position, 0);
		if (positionAttribute.addUpdateRange) {
			positionAttribute.clearUpdateRanges();
			positionAttribute.addUpdateRange(0, position.length);
		} else { // compatibility with r158 earlier
			positionAttribute.updateRange.count = position.length;
		}
		positionAttribute.needsUpdate = true;

		this._resizeAttribute('normal', normal.length);
		const normalAttribute = this.getAttribute('normal');
		normalAttribute.array.set(normal, 0);
		if (normalAttribute.addUpdateRange) {
			normalAttribute.clearUpdateRanges();
			normalAttribute.addUpdateRange(0, normal.length);
		} else { // compatibility with r158 earlier
			normalAttribute.updateRange.count = normal.length;
		}
		normalAttribute.needsUpdate = true;

		this._resizeAttribute('uv', uv.length);
		const uvAttribute = this.getAttribute('uv');
		uvAttribute.array.set(uv, 0);
		if (uvAttribute.addUpdateRange) {
			uvAttribute.clearUpdateRanges();
			uvAttribute.addUpdateRange(0, uv.length);
		} else { // compatibility with r158 earlier
			uvAttribute.updateRange.count = uv.length;
		}
		uvAttribute.needsUpdate = true;

		if (uv2) {
			this._resizeAttribute('uv2', uv2.length);
			const uv2Attribute = this.getAttribute('uv2');
			uv2Attribute.array.set(uv2, 0);
			if (uv2Attribute.addUpdateRange) {
				uv2Attribute.clearUpdateRanges();
				uv2Attribute.addUpdateRange(0, uv2.length);
			} else { // compatibility with r158 earlier
				uv2Attribute.updateRange.count = uv2.length;
			}
			uv2Attribute.needsUpdate = true;
		}

		this._resizeIndex(indices.length);
		const indexAttribute = this.getIndex();
		indexAttribute.set(indices, 0);
		if (indexAttribute.addUpdateRange) {
			indexAttribute.clearUpdateRanges();
			indexAttribute.addUpdateRange(0, indices.length);
		} else { // compatibility with r158 earlier
			indexAttribute.updateRange.count = indices.length;
		}
		indexAttribute.needsUpdate = true;
	}

}

// Vertex Data Generate Functions

function generatePathVertexData(pathPointList, options, generateUv2 = false) {
	const width = options.width || 0.1;
	const progress = options.progress !== undefined ? options.progress : 1;
	const arrow = options.arrow !== undefined ? options.arrow : true;
	const side = options.side !== undefined ? options.side : 'both';

	const halfWidth = width / 2;
	const sideWidth = (side !== 'both' ? width / 2 : width);
	const totalDistance = pathPointList.distance();
	const progressDistance = progress * totalDistance;
	if (totalDistance == 0) {
		return null;
	}

	const sharpUvOffset = halfWidth / sideWidth;
	const sharpUvOffset2 = halfWidth / totalDistance;

	let count = 0;

	// modify data
	const position = [];
	const normal = [];
	const uv = [];
	const uv2 = [];
	const indices = [];
	let verticesCount = 0;

	const right = new Vector3();
	const left = new Vector3();

	// for sharp corners
	const leftOffset = new Vector3();
	const rightOffset = new Vector3();
	const tempPoint1 = new Vector3();
	const tempPoint2 = new Vector3();

	function addVertices(pathPoint) {
		const first = position.length === 0;
		const sharpCorner = pathPoint.sharp && !first;

		const uvDist = pathPoint.dist / sideWidth;
		const uvDist2 = pathPoint.dist / totalDistance;

		const dir = pathPoint.dir;
		const up = pathPoint.up;
		const _right = pathPoint.right;

		if (side !== 'left') {
			right.copy(_right).multiplyScalar(halfWidth * pathPoint.widthScale);
		} else {
			right.set(0, 0, 0);
		}

		if (side !== 'right') {
			left.copy(_right).multiplyScalar(-halfWidth * pathPoint.widthScale);
		} else {
			left.set(0, 0, 0);
		}

		right.add(pathPoint.pos);
		left.add(pathPoint.pos);

		if (sharpCorner) {
			leftOffset.fromArray(position, position.length - 6).sub(left);
			rightOffset.fromArray(position, position.length - 3).sub(right);

			const leftDist = leftOffset.length();
			const rightDist = rightOffset.length();

			const sideOffset = leftDist - rightDist;
			let longerOffset, longEdge;

			if (sideOffset > 0) {
				longerOffset = leftOffset;
				longEdge = left;
			} else {
				longerOffset = rightOffset;
				longEdge = right;
			}

			tempPoint1.copy(longerOffset).setLength(Math.abs(sideOffset)).add(longEdge);

			const _cos = tempPoint2.copy(longEdge).sub(tempPoint1).normalize().dot(dir);
			const _len = tempPoint2.copy(longEdge).sub(tempPoint1).length();
			const _dist = _cos * _len * 2;

			tempPoint2.copy(dir).setLength(_dist).add(tempPoint1);

			if (sideOffset > 0) {
				position.push(
					tempPoint1.x, tempPoint1.y, tempPoint1.z, // 6
					right.x, right.y, right.z, // 5
					left.x, left.y, left.z, // 4
					right.x, right.y, right.z, // 3
					tempPoint2.x, tempPoint2.y, tempPoint2.z, // 2
					right.x, right.y, right.z // 1
				);

				verticesCount += 6;

				indices.push(
					verticesCount - 6, verticesCount - 8, verticesCount - 7,
					verticesCount - 6, verticesCount - 7, verticesCount - 5,

					verticesCount - 4, verticesCount - 6, verticesCount - 5,
					verticesCount - 2, verticesCount - 4, verticesCount - 1
				);

				count += 12;
			} else {
				position.push(
					left.x, left.y, left.z, // 6
					tempPoint1.x, tempPoint1.y, tempPoint1.z, // 5
					left.x, left.y, left.z, // 4
					right.x, right.y, right.z, // 3
					left.x, left.y, left.z, // 2
					tempPoint2.x, tempPoint2.y, tempPoint2.z // 1
				);

				verticesCount += 6;

				indices.push(
					verticesCount - 6, verticesCount - 8, verticesCount - 7,
					verticesCount - 6, verticesCount - 7, verticesCount - 5,

					verticesCount - 6, verticesCount - 5, verticesCount - 3,
					verticesCount - 2, verticesCount - 3, verticesCount - 1
				);

				count += 12;
			}

			normal.push(
				up.x, up.y, up.z,
				up.x, up.y, up.z,
				up.x, up.y, up.z,
				up.x, up.y, up.z,
				up.x, up.y, up.z,
				up.x, up.y, up.z
			);

			uv.push(
				uvDist - sharpUvOffset, 0,
				uvDist - sharpUvOffset, 1,
				uvDist, 0,
				uvDist, 1,
				uvDist + sharpUvOffset, 0,
				uvDist + sharpUvOffset, 1
			);

			if (generateUv2) {
				uv2.push(
					uvDist2 - sharpUvOffset2, 0,
					uvDist2 - sharpUvOffset2, 1,
					uvDist2, 0,
					uvDist2, 1,
					uvDist2 + sharpUvOffset2, 0,
					uvDist2 + sharpUvOffset2, 1
				);
			}
		} else {
			position.push(
				left.x, left.y, left.z,
				right.x, right.y, right.z
			);

			normal.push(
				up.x, up.y, up.z,
				up.x, up.y, up.z
			);

			uv.push(
				uvDist, 0,
				uvDist, 1
			);

			if (generateUv2) {
				uv2.push(
					uvDist2, 0,
					uvDist2, 1
				);
			}

			verticesCount += 2;

			if (!first) {
				indices.push(
					verticesCount - 2, verticesCount - 4, verticesCount - 3,
					verticesCount - 2, verticesCount - 3, verticesCount - 1
				);

				count += 6;
			}
		}
	}

	const sharp = new Vector3();
	function addStart(pathPoint) {
		const dir = pathPoint.dir;
		const up = pathPoint.up;
		const _right = pathPoint.right;

		const uvDist = pathPoint.dist / sideWidth;
		const uvDist2 = pathPoint.dist / totalDistance;

		if (side !== 'left') {
			right.copy(_right).multiplyScalar(halfWidth * 2);
		} else {
			right.set(0, 0, 0);
		}

		if (side !== 'right') {
			left.copy(_right).multiplyScalar(-halfWidth * 2);
		} else {
			left.set(0, 0, 0);
		}

		sharp.copy(dir).setLength(halfWidth * 3);

		right.add(pathPoint.pos);
		left.add(pathPoint.pos);
		sharp.add(pathPoint.pos);

		position.push(
			left.x, left.y, left.z,
			right.x, right.y, right.z,
			sharp.x, sharp.y, sharp.z
		);

		normal.push(
			up.x, up.y, up.z,
			up.x, up.y, up.z,
			up.x, up.y, up.z
		);

		uv.push(
			uvDist, side !== 'both' ? (side !== 'right' ? -2 : 0) : -0.5,
			uvDist, side !== 'both' ? (side !== 'left' ? 2 : 0) : 1.5,
			uvDist + 1.5, side !== 'both' ? 0 : 0.5
		);

		if (generateUv2) {
			uv2.push(
				uvDist2, side !== 'both' ? (side !== 'right' ? -2 : 0) : -0.5,
				uvDist2, side !== 'both' ? (side !== 'left' ? 2 : 0) : 1.5,
				uvDist2 + (1.5 * width / totalDistance), side !== 'both' ? 0 : 0.5
			);
		}

		verticesCount += 3;

		indices.push(
			verticesCount - 1, verticesCount - 3, verticesCount - 2
		);

		count += 3;
	}

	let lastPoint;

	if (progressDistance > 0) {
		for (let i = 0; i < pathPointList.count; i++) {
			const pathPoint = pathPointList.array[i];

			if (pathPoint.dist > progressDistance) {
				const prevPoint = pathPointList.array[i - 1];
				lastPoint = new PathPoint();

				// linear lerp for progress
				const alpha = (progressDistance - prevPoint.dist) / (pathPoint.dist - prevPoint.dist);
				lastPoint.lerpPathPoints(prevPoint, pathPoint, alpha);

				addVertices(lastPoint);
				break;
			} else {
				addVertices(pathPoint);
			}
		}
	} else {
		lastPoint = pathPointList.array[0];
	}

	// build arrow geometry
	if (arrow) {
		lastPoint = lastPoint || pathPointList.array[pathPointList.count - 1];
		addStart(lastPoint);
	}

	return {
		position,
		normal,
		uv,
		uv2,
		indices,
		count
	};
}

/**
 * PathTubeGeometry
 */
class PathTubeGeometry extends PathGeometry {

	/**
	 * @param {object|number} initData - If initData is number, geometry init by empty data and set it as the max vertex. If initData is Object, it contains pathPointList and options.
	 * @param {boolean} [generateUv2=false]
	 */
	constructor(initData = 1000, generateUv2 = false) {
		super(initData, generateUv2);
	}

	_initByData(pathPointList, options = {}, usage, generateUv2) {
		const vertexData = generateTubeVertexData$1(pathPointList, options, generateUv2);

		if (vertexData && vertexData.count !== 0) {
			this.setAttribute('position', new BufferAttribute(new Float32Array(vertexData.position), 3).setUsage(usage || StaticDrawUsage));
			this.setAttribute('normal', new BufferAttribute(new Float32Array(vertexData.normal), 3).setUsage(usage || StaticDrawUsage));
			this.setAttribute('uv', new BufferAttribute(new Float32Array(vertexData.uv), 2).setUsage(usage || StaticDrawUsage));
			if (generateUv2) {
				this.setAttribute('uv2', new BufferAttribute(new Float32Array(vertexData.uv2), 2).setUsage(usage || StaticDrawUsage));
			}

			this.setIndex((vertexData.position.length / 3) > 65536 ?
				new Uint32BufferAttribute(vertexData.indices, 1) :
				new Uint16BufferAttribute(vertexData.indices, 1)
			);
		} else {
			this._initByMaxVertex(2, generateUv2);
		}
	}

	/**
	 * Update geometry by PathPointList instance
	 * @param {PathPointList} pathPointList
	 * @param {Object} options
	 * @param {Number} [options.radius=0.1]
	 * @param {Number} [options.progress=1]
	 * @param {Boolean} [options.radialSegments=8]
	 * @param {String} [options.startRad=0]
	 */
	update(pathPointList, options = {}) {
		const generateUv2 = !!this.getAttribute('uv2');

		const vertexData = generateTubeVertexData$1(pathPointList, options, generateUv2);

		if (vertexData) {
			this._updateAttributes(vertexData.position, vertexData.normal, vertexData.uv, generateUv2 ? vertexData.uv2 : null, vertexData.indices);
			this.drawRange.count = vertexData.count;
		} else {
			this.drawRange.count = 0;
		}
	}

}

// Vertex Data Generate Functions

function generateTubeVertexData$1(pathPointList, options, generateUv2 = false) {
	const radius = options.radius || 0.1;
	const progress = options.progress !== undefined ? options.progress : 1;
	const radialSegments = Math.max(2, options.radialSegments || 8);
	const startRad = options.startRad || 0;

	const circum = radius * 2 * Math.PI;
	const totalDistance = pathPointList.distance();
	const progressDistance = progress * totalDistance;
	if (progressDistance == 0) {
		return null;
	}

	let count = 0;

	// modify data
	const position = [];
	const normal = [];
	const uv = [];
	const uv2 = [];
	const indices = [];
	let verticesCount = 0;

	const normalDir = new Vector3();
	function addVertices(pathPoint, radius, radialSegments) {
		const first = position.length === 0;
		const uvDist = pathPoint.dist / circum;
		const uvDist2 = pathPoint.dist / totalDistance;

		for (let r = 0; r <= radialSegments; r++) {
			let _r = r;
			if (_r == radialSegments) {
				_r = 0;
			}
			normalDir.copy(pathPoint.up).applyAxisAngle(pathPoint.dir, startRad + Math.PI * 2 * _r / radialSegments).normalize();

			position.push(pathPoint.pos.x + normalDir.x * radius * pathPoint.widthScale, pathPoint.pos.y + normalDir.y * radius * pathPoint.widthScale, pathPoint.pos.z + normalDir.z * radius * pathPoint.widthScale);
			normal.push(normalDir.x, normalDir.y, normalDir.z);
			uv.push(uvDist, r / radialSegments);

			if (generateUv2) {
				uv2.push(uvDist2, r / radialSegments);
			}

			verticesCount++;
		}

		if (!first) {
			const begin1 = verticesCount - (radialSegments + 1) * 2;
			const begin2 = verticesCount - (radialSegments + 1);

			for (let i = 0; i < radialSegments; i++) {
				indices.push(
					begin2 + i, begin1 + i, begin1 + i + 1,
					begin2 + i, begin1 + i + 1, begin2 + i + 1
				);

				count += 6;
			}
		}
	}

	if (progressDistance > 0) {
		for (let i = 0; i < pathPointList.count; i++) {
			const pathPoint = pathPointList.array[i];

			if (pathPoint.dist > progressDistance) {
				const prevPoint = pathPointList.array[i - 1];
				const lastPoint = new PathPoint();

				// linear lerp for progress
				const alpha = (progressDistance - prevPoint.dist) / (pathPoint.dist - prevPoint.dist);
				lastPoint.lerpPathPoints(prevPoint, pathPoint, alpha);

				addVertices(lastPoint, radius, radialSegments);
				break;
			} else {
				addVertices(pathPoint, radius, radialSegments);
			}
		}
	}

	return {
		position,
		normal,
		uv,
		uv2,
		indices,
		count
	};
}

/**
 * PathRectangleGeometry
 */
class PathRectangleGeometry extends PathGeometry {
  /**
   * @param {object|number} initData - If initData is number, geometry init by empty data and set it as the max vertex. If initData is Object, it contains pathPointList and options.
   * @param {boolean} [generateUv2=false]
   */
  constructor(initData = 1000, generateUv2 = false) {
    super(initData, generateUv2);
  }

  _initByData(pathPointList, options = {}, usage, generateUv2) {
    const vertexData = generateTubeVertexData(
      pathPointList,
      options,
      generateUv2
    );

    if (vertexData && vertexData.count !== 0) {
      this.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(vertexData.position), 3).setUsage(
          usage || StaticDrawUsage
        )
      );
      this.setAttribute(
        "normal",
        new BufferAttribute(new Float32Array(vertexData.normal), 3).setUsage(
          usage || StaticDrawUsage
        )
      );
      this.setAttribute(
        "uv",
        new BufferAttribute(new Float32Array(vertexData.uv), 2).setUsage(
          usage || StaticDrawUsage
        )
      );
      if (generateUv2) {
        this.setAttribute(
          "uv2",
          new BufferAttribute(new Float32Array(vertexData.uv2), 2).setUsage(
            usage || StaticDrawUsage
          )
        );
      }

      this.setIndex(
        vertexData.position.length / 3 > 65536
          ? new Uint32BufferAttribute(vertexData.indices, 1)
          : new Uint16BufferAttribute(vertexData.indices, 1)
      );
    } else {
      this._initByMaxVertex(2, generateUv2);
    }
  }

  /**
   * Update geometry by PathPointList instance
   * @param {PathPointList} pathPointList
   * @param {Object} options
   * @param {Number} [options.radius=0.1]
   * @param {Number} [options.progress=1]
   * @param {Boolean} [options.radialSegments=8]
   * @param {String} [options.startRad=0]
   */
  update(pathPointList, options = {}) {
    const generateUv2 = !!this.getAttribute("uv2");

    const vertexData = generateTubeVertexData(
      pathPointList,
      options,
      generateUv2
    );

    if (vertexData) {
      this._updateAttributes(
        vertexData.position,
        vertexData.normal,
        vertexData.uv,
        generateUv2 ? vertexData.uv2 : null,
        vertexData.indices
      );
      this.drawRange.count = vertexData.count;
    } else {
      this.drawRange.count = 0;
    }
  }
}

// Vertex Data Generate Functions

function generateTubeVertexData(pathPointList, options, generateUv2 = false) {
  const progress = options.progress !== undefined ? options.progress : 1;
  const width = options.width || 1;
  const height = options.height || 0.5;

  // debugger;

  const totalDistance = pathPointList.distance();

  const progressDistance = progress * totalDistance;
  if (progressDistance == 0) {
    return null;
  }

  let count = 0;

  // modify data
  const position = [];
  const normal = [];
  const uv = [];
  const uv2 = [];
  const indices = [];

  //高度宽度的一半来计算
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const sideTotalDis = (width + height) * 2;

  //添加顶点
  function addVertices(pathPoint) {
    // console.log(pathPoint, "路径点");

    const centerPosition = pathPoint.pos.clone();
    const up = pathPoint.up.clone();
    const right = pathPoint.right.clone();

    // A---------B
    // |         |
    // |    o    |
    // |         |
    // D---------C

    //先从position开始算起

    const A = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(halfHeight))
      .add(right.clone().multiplyScalar(-halfWidth));
    const A1 = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(halfHeight))
      .add(right.clone().multiplyScalar(-halfWidth));
    const B = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(halfHeight))
      .add(right.clone().multiplyScalar(halfWidth));
    const B1 = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(halfHeight))
      .add(right.clone().multiplyScalar(halfWidth));
    const C = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(-halfHeight))
      .add(right.clone().multiplyScalar(halfWidth));
    const C1 = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(-halfHeight))
      .add(right.clone().multiplyScalar(halfWidth));
    const D = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(-halfHeight))
      .add(right.clone().multiplyScalar(-halfWidth));
    const D1 = centerPosition
      .clone()
      .add(up.clone().multiplyScalar(-halfHeight))
      .add(right.clone().multiplyScalar(-halfWidth));

    position.push(A1.x, A1.y, A1.z);
    position.push(B.x, B.y, B.z);
    position.push(B1.x, B1.y, B1.z);
    position.push(C.x, C.y, C.z);
    position.push(C1.x, C1.y, C1.z);
    position.push(D.x, D.y, D.z);
    position.push(D1.x, D1.y, D1.z);
    position.push(A.x, A.y, A.z);

    const normalA = right.clone().negate().normalize();
    const normalA1 = up.clone().normalize();
    const normalB = normalA1.clone();
    const normalB1 = normalA.clone().negate();
    const normalC = normalB1.clone();
    const normalC1 = normalB.clone().negate();
    const normalD = normalC1.clone();
    const normalD1 = normalA.clone();
    normal.push(normalA1.x, normalA1.y, normalA1.z);
    normal.push(normalB.x, normalB.y, normalB.z);
    normal.push(normalB1.x, normalB1.y, normalB1.z);
    normal.push(normalC.x, normalC.y, normalC.z);
    normal.push(normalC1.x, normalC1.y, normalC1.z);
    normal.push(normalD.x, normalD.y, normalD.z);
    normal.push(normalD1.x, normalD1.y, normalD1.z);
    normal.push(normalA.x, normalA.y, normalA.z);

    // nowDis += pathPoint.dist;
    //计算uv
    const v = pathPoint.dist / totalDistance;

    // uv.push(0, v);
    // uv.push(height / sideTotalDis, v);
    // uv.push(height / sideTotalDis, v);
    // uv.push((height + width) / sideTotalDis, v);
    // uv.push((height + width) / sideTotalDis, v);
    // uv.push((height * 2 + width) / sideTotalDis, v);
    // uv.push((height * 2 + width) / sideTotalDis, v);
    // uv.push(1, v);

    uv.push(v, 0);
    uv.push(v, width / sideTotalDis);
    uv.push(v, width / sideTotalDis);
    uv.push(v, (height + width) / sideTotalDis);
    uv.push(v, (height + width) / sideTotalDis);
    uv.push(v, (width * 2 + height) / sideTotalDis);
    uv.push(v, (width * 2 + height) / sideTotalDis);
    uv.push(v, 1);

    count += 8;
  }

  if (progressDistance > 0) {
    for (let i = 0; i < pathPointList.count; i++) {
      const pathPoint = pathPointList.array[i];

      if (pathPoint.dist > progressDistance) {
        const prevPoint = pathPointList.array[i - 1];
        const lastPoint = new PathPoint();

        // linear lerp for progress
        const alpha =
          (progressDistance - prevPoint.dist) /
          (pathPoint.dist - prevPoint.dist);
        lastPoint.lerpPathPoints(prevPoint, pathPoint, alpha);

        addVertices(lastPoint);
        break;
      } else {
        addVertices(pathPoint);
      }
    }
  }

  const positionNum = position.length / 3;
  //开始计算index的连接
  for (let i = 0; i < positionNum; i += 8) {
    // a--------b
    // | \      |
    // |   \    |
    // |     \  |
    // c--------d

    if (i + 8 < count) {
      const a = i;
      const b = i + 8;
      const c = i + 1;
      const d = i + 8 + 1;

      const a1 = i + 2;
      const b1 = i + 8 + 2;
      const c1 = i + 3;
      const d1 = i + 8 + 3;

      const a2 = i + 4;
      const b2 = i + 8 + 4;
      const c2 = i + 5;
      const d2 = i + 8 + 5;

      const a3 = i + 6;
      const b3 = i + 8 + 6;
      const c3 = i + 7;
      const d3 = i + 8 + 7;

      indices.push(a, c, d);
      indices.push(a, d, b);

      indices.push(a1, c1, d1);
      indices.push(a1, d1, b1);

      indices.push(a2, c2, d2);
      indices.push(a2, d2, b2);

      indices.push(a3, c3, d3);
      indices.push(a3, d3, b3);
    }
  }

  return {
    position,
    normal,
    uv,
    uv2,
    indices,
    count,
  };
}

export { PathGeometry, PathPointList, PathRectangleGeometry, PathTubeGeometry };
