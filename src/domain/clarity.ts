// 照片清晰度检测：对灰度图计算拉普拉斯算子方差，方差过低说明画面模糊。
// 只作为提示，结果为“看不清”时建议重拍，由用户决定是否继续。

export const BLUR_THRESHOLD = 60;

/** gray: 长度为 width*height 的灰度值（0–255） */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function rgbaToGray(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return out;
}

export function isBlurry(variance: number): boolean {
  return variance < BLUR_THRESHOLD;
}
