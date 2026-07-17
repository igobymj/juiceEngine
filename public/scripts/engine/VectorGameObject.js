/*
  VectorGameObject class
  
  The VectorGameObject is our core class that inherits from GameObject and adds additional functionality for handling/rendering vector graphics in the form of an array of p5.Vector points. It is the class from which all other vector graphic related classes that will be rendered upon the screen inherit from. It stores the key variables that are needed by all vector objects such as vertices, strokeWidth, and strokeColor.
    
  By Eddie Melcer
  Last Updated 5/7/22 by Eddie
*/

import GameObject from "./GameObject.js";
import HelperFunctions from "./HelperFunctions.js";


export default class VectorGameObject extends GameObject {
  /* Constructor */
  // The constructor initializes our VectorGameObject class
  // It takes the following key parameters and stores them:
  // float x, float y, p5.Vector array vertices, float rotation (radians), float scale, int alpha (between 0 and 255)
  constructor(gameSession, x, y, vertices, closeShape, strokeWeight, fill, rotation, scale, alpha, shapeOverride) {
    // Calculate the width and height of our vector graphic
    // Go through all vertices to find the min/max x and y
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < vertices.length; i++) {
      let vertex = vertices[i];

      if (vertex.x < minX) minX = vertex.x;
      if (vertex.x > maxX) maxX = vertex.x;
      if (vertex.y < minY) minY = vertex.y;
      if (vertex.y > maxY) maxY = vertex.y;
    }

    // Use min/max x and y to calculate width and height of vector object
    // NOTE: does not allow 0 width or height, even a point should be 1px by 1px for proper rendering and collision detection
    let width = maxX - minX;
    width = width == 0 ? 1 : width;

    let height = maxY - minY;
    height = height == 0 ? 1 : height;

    // Now we have everything we need to call the base GameObject constructor
    super(gameSession, x, y, width, height, rotation, scale, alpha);

    // Convert the passed in vertices to a p5.Vector array
    let vectorVertices = HelperFunctions.Point2VectorArray(this.p5, vertices);

    // Store our vertices, strokeWeight, and strokeColor for rendering later
    this.__vertices = vectorVertices;
	  this.__closeShape = closeShape;
    this.__strokeWeight = strokeWeight;
    this.__strokeColor = this.p5.color(255);
	  this.__fill = fill;
	  this.__fillColor = this.p5.color(255);
    this.__shapeOverride = shapeOverride; // only works for circle!! also will break collision

    // Set our boundary to be our vertices for precise collision detection
    this.boundaryVertices = vectorVertices;
  }

  /* "Derived" Class Methods */
  // Overrides needed virtual methods from the base GameObject class
  // Our render method handles drawing a vector graphic using our vertices and native p5.js drawing functionality
  render() {
  	super.beginRender();
  	
    // Now draw our shape from the vertices (base game object should have already taken care of translation, rotation, and scale with begin/end render)
    this.renderSetup();
    if(this.__shapeOverride === "circle" || this.__shapeOverride === "dot"){
      this.renderCircle();
    }
  	else {
      this.renderVertices();
    }
  	
  	super.endRender();
  }
  

  renderSetup() {
    // Style formatting
    // Prevent scaling of the stroke weight when scaling the verticies/graphic
    this.p5.strokeWeight((1 / this.scale) * this.strokeWeight);
    // Set the stroke color
      this.p5.stroke([this.p5.red(this.strokeColor), this.p5.green(this.strokeColor), this.p5.blue(this.strokeColor), this.alpha]);
    // Handle fill
    if(this.fill){
      this.p5.fill([this.p5.red(this.fillColor), this.p5.green(this.fillColor), this.p5.blue(this.fillColor), this.alpha]);
    }
    else{
      this.p5.noFill();
    }

  }

  renderCircle() {
    
    // this is super hacky for now

    let radius;
    if(this.__shapeOverride === "dot") {
      radius = 1;
    }
    else {
      radius = 5; 
    }
    this.p5.ellipse(0, 0, radius);
  }


  // Our renderVertices method handles drawing the vector shape from the vertices
  renderVertices(){

    this.p5.beginShape();
    
	for(let i=0; i< this.__vertices.length; i++) {
      this.p5.vertex(this.__vertices[i].x, this.__vertices[i].y);
    }
    
    // Depending on the closeShape mode, we can end the shape as closed or open
    if(this.closeShape){
      this.p5.endShape(this.p5.CLOSE);
    }else{
      this.p5.endShape();
    }
  }
  
  /* Getters and Setters */
  // Vertices getter and setter
  get vertices(){
	return HelperFunctions.CloneVectorArray(this.__vertices);
  }
  
  set vertices(newVertices){
	this.__vertices = HelperFunctions.CloneVectorArray(newVertices);
  }
  
  // Close shape rendering setting getter and setter
  get closeShape(){
    return this.__closeShape;
  }
  
  set closeShape(newCloseShapeSetting){
    this.__closeShape = newCloseShapeSetting;
  }
  
  // Stroke weight getter and setter
  get strokeWeight() {
    return this.__strokeWeight;
  }

  set strokeWeight(newStrokeWeight) {
    this.__strokeWeight = newStrokeWeight;
  }

  // Stroke color getter and setter
  get strokeColor() {
    return this.__strokeColor;
  }

  set strokeColor(newStrokeColor) {
    this.__strokeColor = newStrokeColor;
  }
  
  // Vector shape fill on/off getter and setter
  get fill(){
    return this.__fill;
  }
  
  set fill(newFillSetting){
    this.__fill = newFillSetting;
  }
  
  // Vector shape fill color getter and setter
  get fillColor(){
    return this.__fillColor;
  }
  
  set fillColor(newColor){
    this.__fillColor = newColor;
  }
}