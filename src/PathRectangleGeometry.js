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
  const radius = options.radius || 0.1;
  const progress = options.progress !== undefined ? options.progress : 1;
  const width = options.width || 1;
  const height = options.height || 0.5;

  // debugger;

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

  function addVertices(pathPoint, width, height) {
    const first = position.length === 0;
    const uvDist = pathPoint.dist / circum;
    const uvDist2 = pathPoint.dist / totalDistance;
    // const width = 1;
    // const height = 0.5;

    let totalR = (width + height) * 2;
    let nowDis = 0;
    for (let r = 0; r <= 4; r++) {
      // debugger;
      // let _r = r;
      // if (_r == 4) {
      //   _r = 0;
      // }
      // normalDir
      //   .copy(pathPoint.up)
      //   .applyAxisAngle(
      //     pathPoint.dir,
      //     startRad + Math.PI / 4 + (Math.PI * 2 * _r) / 4
      //   )
      //   .normalize();

      // position.push(
      //   pathPoint.pos.x + normalDir.x * radius * pathPoint.widthScale,
      //   pathPoint.pos.y + normalDir.y * radius * pathPoint.widthScale,
      //   pathPoint.pos.z + normalDir.z * radius * pathPoint.widthScale
      // );

      //点的位置
      const pos = pathPoint.pos.clone();
      //叉乘得到垂直于两个向量的垂向量
      const normalDir = pathPoint.up
        .clone()
        .cross(pathPoint.dir.clone())
        .normalize();

      //先只计算高度
      const heightPos = pathPoint.up
        .clone()
        .normalize()
        .multiplyScalar(height / 2);
      if (r == 2 || r == 3) {
        heightPos.negate();
      }

      //在计算宽度
      const widthPos = normalDir.clone().multiplyScalar(width / 2);

      if (r == 1 || r == 2) {
        widthPos.negate();
      }

      const finalPos = pos.clone().add(heightPos).add(widthPos);

      //得到最终的位置
      position.push(finalPos.x, finalPos.y, finalPos.z);

      normal.push(normalDir.x, normalDir.y, normalDir.z);

      if (r == 1 || r == 3) {
        nowDis += width;
      } else if (r == 2 || r == 4) {
        nowDis += height;
      }

      uv.push(uvDist, nowDis / totalR);

      if (generateUv2) {
        uv2.push(uvDist2, nowDis / totalR);
      }

      verticesCount++;
    }

    if (!first) {
      const begin1 = verticesCount - (4 + 1) * 2;
      const begin2 = verticesCount - (4 + 1);

      for (let i = 0; i < 4; i++) {
        indices.push(
          begin2 + i,
          begin1 + i,
          begin1 + i + 1,
          begin2 + i,
          begin1 + i + 1,
          begin2 + i + 1
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
        const alpha =
          (progressDistance - prevPoint.dist) /
          (pathPoint.dist - prevPoint.dist);
        lastPoint.lerpPathPoints(prevPoint, pathPoint, alpha);

        addVertices(lastPoint, width, height);
        break;
      } else {
        addVertices(pathPoint, width, height);
      }
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
