import {
  BufferAttribute,
  Uint32BufferAttribute,
  Uint16BufferAttribute,
  StaticDrawUsage,
  Vector3,
} from "three";
import { PathPoint } from "./PathPoint.js";
import { PathGeometry } from "./PathGeometry.js";

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

export { PathRectangleGeometry };
