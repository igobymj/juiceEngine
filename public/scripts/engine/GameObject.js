/*
  GameObject class
  
  The GameObject is our core base class from which all other objects that will be rendered upon the screen inherit from.
  It stores the key variables that are needed by all objects such as position, size, rotation, and scale.
    
  By Eddie Melcer
  Last Updated 5/7/22 by Eddie
*/

import HelperFunctions from "./HelperFunctions.js";
import Collision from "./Collision.js";


export default class GameObject {
  /* Constructor */
  // The constructor initializes our GameObject class
  // It takes the following key parameters and stores them:
  // gameSession, float x, float y, float width, float height, float rotation (radians), float scale, int alpha (between 0 and 255)
  // NOTE: x, y and width, height are stored as p5.vectors called position and size respectively
  constructor(gameSession, x, y, width, height, rotation, scale, alpha) {
    this.__gameSession = gameSession;
	// Get the p5 instance we will be using from the GameSession
    this.__p5 = this.gameSession.p5;
	// Setup our other member variables
    this.__position = this.p5.createVector(x, y);
    this.__size = this.p5.createVector(width, height);
    this.__rotation = rotation;
    this.__scale = scale;
    this.__alpha = alpha;
	

    // The boundary is essentially our collider for the game object and used for collision detection
    // The default boundary is the rect of the game object so we need to create the verticies to represent the appropriate rect shape
    // Since we render from the center of the object, the verticies of the boundary assume the origin of the center of the game object is 0, 0
    // Note: verticies only define the shape of the boundary. The transformedBoundary getter provieds these verticies with proper translation, rotation, and scale applied for the game object
    this.__boundaryVertices = [];
    // Top left corner
    this.__boundaryVertices.push(this.p5.createVector(-width / 2, -height / 2));
    // Top right corner
    this.__boundaryVertices.push(this.p5.createVector(width / 2, -height / 2));
    // Bottom right corner
    this.__boundaryVertices.push(this.p5.createVector(width / 2, height / 2));
    // Bottom left corner
    this.__boundaryVertices.push(this.p5.createVector(-width / 2, height / 2));
  }

  /* "Virtual" Class Methods */
  // All methods are virtual in javascript by default, but we'll put a print warning in these to remind deriving classes to overload them
  // NOTE: we are also applying the Game Loop game design pattern by decoupling update and render

  // Our update method should be overloaded and all deriving classes should handle update logic here
  update() {
    console.log("WARNING: update method from base GameObject class was called. This should be overloaded in the derived class.");
  }

  // Our render method should be overloaded and all deriving classes should handle drawing logic here
  render() {
    console.log("WARNING: render method from base GameObject class was called. This should be overloaded in the derived class.");
  }

  /* Class Methods */
  // OPTIONAL: this method will handle all translation, rotation, and scaling involved with drawing a derived object if called at the beginning of rendering
  // This will help to ensure proper transformation order
  // NOTE: If beginRender is called then endRender must be called at the end of your render method!
  beginRender() {
    this.p5.push();
    this.p5.translate(this.x, this.y);
    this.p5.rotate(this.rotation);
    this.p5.scale(this.scale);
  }

  // OPTIONAL: this method resets the drawing state at the end of rendering
  // NOTE: this must be called at the end of your render function if you call beginRender at the beginning
  endRender() {
    this.p5.pop();
  }

  // The collide method takes another game object and checks if there is a collision via circle and then polygon collision as the default form of collision detection
  collide(otherGameObject) {
    // Optimization: do a low-cost check for circle to circle collision first to see if the objects are even close enough to warrant doing the more intensive polygon to polygon collision detection
    if (Collision.Circle2CircleCollision(this.position, this.diagonal / 2, otherGameObject.position, otherGameObject.diagonal / 2)) {
      return Collision.Polygon2PolygonCollision(this.boundary, otherGameObject.boundary);
    }

    // Otherwise no collision
    return false;
  }

  /* Getters and Setters */
  // Note: primitives are automatically passed by value however objects such as P5.vector are not
  // Therefore, we make copies of all objects that are passed by reference to avoid accidental changes to object values inside of our class by code outside of it
  // X getter and setter
  get x() {
    return this.__position.x;
  }

  set x(newX) {
    this.__position.x = newX;
  }

  // Y getter and setter
  get y() {
    return this.__position.y;
  }

  set y(newY) {
    this.__position.y = newY;
  }

  // Position getter and setter
  // NOTE: since p5.vector is passed by reference, we use the p5.vector copy method 
  // This will ensure that only values are stored/passed rather than references
  get position() {
    return this.__position.copy();
  }

  set position(newPosition) {
    this.__position = newPosition.copy();
  }

  // Width getter and setter
  get width() {
    return this.__size.x;
  }

  set width(newWidth) {
    this.__size.x = newWidth;
  }

  // Height getter and setter
  get height() {
    return this.__size.y;
  }

  set height(newHeight) {
    this.__size.y = newHeight;
  }

  // Size getter and setter
  // Same issue as the position getter/setter
  get size() {
    return this.__size.copy();
  }

  set size(newSize) {
    this.__size = newSize.copy();
  }

  // Corner getters for the positions of scaled and rotated corners
  // Top left corner getter
  get topLeftCorner() {
    // Calculate top left corner
    // Top left x
    let topLeftX =
      this.x - (this.scale * (this.width / 2)) *
      Math.cos(this.rotation) + (this.scale * (this.height / 2)) *
      Math.sin(this.rotation);
    // Top left y
    let topLeftY =
      this.y - (this.scale * (this.width / 2)) *
      Math.sin(this.rotation) - (this.scale * (this.height / 2)) *
      Math.cos(this.rotation);

    // Return our top left corner coordinates stored as a p5.Vector
    return this.p5.createVector(topLeftX, topLeftY);

  }

  // Top right corner getter
  get topRightCorner() {
    // Calculate top right corner
    // Top right x
    let topRightX =
      this.x + (this.scale * this.width / 2) *
      Math.cos(this.rotation) + (this.scale * this.height / 2) *
      Math.sin(this.rotation);
    // Top right y
    let topRightY =
      this.y + (this.scale * this.width / 2) *
      Math.sin(this.rotation) - (this.scale * this.height / 2) *
      Math.cos(this.rotation);

    // Return our top right corner coordinates stored as a p5.Vector
    return this.p5.createVector(topRightX, topRightY);
  }

  // Bottom right corner getter
  get bottomRightCorner() {
    // Calculate bottom right corner
    // Bottom right x
    let bottomRightX =
      this.x + (this.scale * this.width / 2) *
      Math.cos(this.rotation) - (this.scale * this.height / 2) *
      Math.sin(this.rotation);
    // Bottom right y
    let bottomRightY =
      this.y + (this.scale * this.width / 2) *
      Math.sin(this.rotation) + (this.scale * this.height / 2) *
      Math.cos(this.rotation);

    // Return our bottom right corner coordinates stored as a p5.Vector
    return this.p5.createVector(bottomRightX, bottomRightY);
  }

  // Bottom left corner getter
  get bottomLeftCorner() {
    // Calculate bottom left corner
    // Bottom left x
    let bottomLeftX =
      this.x - (this.scale * this.width / 2) *
      Math.cos(this.rotation) - (this.scale * this.height / 2) *
      Math.sin(this.rotation);
    // Bottom left y
    let bottomLeftY =
      this.y - (this.scale * this.width / 2) *
      Math.sin(this.rotation) + (this.scale * this.height / 2) *
      Math.cos(this.rotation);

    // Return our bottom right corner coordinates stored as a p5.Vector
    return this.p5.createVector(bottomLeftX, bottomLeftY);
  }

  // All corners
  get corners() {
    // Return our corners
    return [this.topLeftCorner, this.topRightCorner, this.bottomRightCorner, this.bottomLeftCorner];
  }

  // Diagonal getter (useful for some forms of collision detection)
  get diagonal() {
    // d = square root of w^2 + h^2 
    // Also accounts for scaling of the GameObject
    return Math.sqrt(Math.pow(this.width * this.scale, 2) + Math.pow(this.height * this.scale, 2));
  }

  // Boundary Vertices getter and setter
  get boundaryVertices() {
    return HelperFunctions.CloneVectorArray(this.__boundaryVertices);
  }

  set boundaryVertices(newBoundaryVertices) {
    this.__boundaryVertices = HelperFunctions.CloneVectorArray(newBoundaryVertices);
  }

  // Boundary getter
  // Returns an array of the translated boundary shape verticies to the location of the current game object
  // Use for collision detection
  get boundary() {
    // Get the boundary shape/verticies
    let shape = this.boundaryVertices;

    // Transform these vertices to the location of the game object
    for (let i = 0; i < shape.length; i++) {
      shape[i].x += this.x;
      shape[i].y += this.y;
    }

    // Now go through each point in our translated boundary, transform it according to rotation and scale, and store it in a new transformedPoints array
    let transformedPoints = [];

    // Optimization so that we don't recalculate and use cos/sin repeatedly
    let cr = Math.cos(this.rotation);
    let sr = Math.sin(this.rotation);

    for (let i = 0; i < shape.length; i++) {
      // Calculate the change in x,y between the center of the boundary (i.e., this.x, this.y) and the x,y of the point we are transforming
      // This way we rotate around the center point of the boundary
      let xDiff = shape[i].x - this.x;
      let yDiff = shape[i].y - this.y;

      // Now use our center point and transform the change in x,y by rotation and scale to calculate the new x,y of our transformed point
      let transformedX = this.x + xDiff * this.scale * cr - yDiff * this.scale * sr;

      let transformedY = this.y + yDiff * this.scale * cr + xDiff * this.scale * sr;

      // Create our new point and add it the the array of transformed boundary points
      let transformedPoint = this.p5.createVector(transformedX, transformedY);
      //circle(transformedX, transformedY, 5);

      transformedPoints.push(transformedPoint);
    }

    // Return our newly transformed boundary
    return transformedPoints;
  }

  wrap() {
      const margin = this.diagonal / 2;
      const w = this.gameSession.canvasWidth;
      const h = this.gameSession.canvasHeight;
      if (this.__position.x > w + margin) { this.__position.x = -margin; }
      if (this.__position.x < -margin) { this.__position.x = w + margin; }
      if (this.__position.y > h + margin) { this.__position.y = -margin; }
      if (this.__position.y < -margin) { this.__position.y = h + margin; }
  }

  // Rotation getter and setter
  get rotation() {
    return this.__rotation;
  }

  set rotation(newRotation) {
    this.__rotation = newRotation;
  }

  // Scale getter and setter
  get scale() {
    return this.__scale;
  }

  set scale(newScale) {
    this.__scale = newScale;
  }

  /// Alpha getter and setter
  get alpha() {
    return this.__alpha;
  }

  set alpha(newAlpha) {
    this.__alpha = newAlpha;
  }
  
  // GameSession getter
  get gameSession(){
	return this.__gameSession;
  }
  
  // p5 getter
  get p5(){
	return this.__p5;
  }
}  