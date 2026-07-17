/*
  Helper Functions Class
  
  This Helper Functions class/file provides globally/statically accessible general purpose functions for use throughout the project
  
  Current functions include:
  - CloneArray -> Performs a recursive deep copy of an array including all nested arrays
  - CloneVectorArray -> Performs a deep copy of an array of p5.Vectors
  - Point2VectorArray -> Performs a conversion of an array of any kind of object with x, y properties into a p5.Vector array using those x, y values
    
  By Eddie Melcer
  Last Updated 4/14/22
*/
export default class HelperFunctions{
  
  // A function that goes through an array of p5.Vectors and performs a deep copy of each vector to a new array and returning it
  static CloneVectorArray(vectorArray){
    let vectorArrayCopy = [];
    
    for(let i = 0; i < vectorArray.length; i++){
      vectorArrayCopy.push(vectorArray[i].copy());
    }

    return vectorArrayCopy;
  }
  
  // A function that goes through an array of any kind of object that has an x and y property and coverts that into a new array of p5.Vectors based on x, y
  static Point2VectorArray(p5, pointArray){
    let vectorArray = [];
    
    for(let i = 0; i < pointArray.length; i++){
      vectorArray.push(p5.createVector(pointArray[i].x, pointArray[i].y));
    }
    
    return vectorArray;
  }
  
  static PerlinNoise(p5, seed, time){
    p5.noiseSeed(seed);
    return p5.noise(time);
  }

  // Convert a hue value (0-360) to an [r, g, b] array. Hue 0 returns null (meaning "default").
  static HueToRGB(hue) {
    if (hue === undefined || hue === null || hue <= 0) return null;
    const h = hue / 60;
    const c = 255;
    const x = c * (1 - Math.abs(h % 2 - 1));
    let r, g, b;
    if (h < 1)      { r = c; g = x; b = 0; }
    else if (h < 2) { r = x; g = c; b = 0; }
    else if (h < 3) { r = 0; g = c; b = x; }
    else if (h < 4) { r = 0; g = x; b = c; }
    else if (h < 5) { r = x; g = 0; b = c; }
    else             { r = c; g = 0; b = x; }
    return [r, g, b];
  }

}