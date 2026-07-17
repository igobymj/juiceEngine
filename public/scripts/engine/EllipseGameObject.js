/* Ellipse game object 

 These ellipses have no collision, and are only used for particles (and eyeballs)

*/

import GameObject from "./GameObject.js";


export default class EllipseGameObject extends GameObject {
	
	//vector2, float, float, float, float, 8-bit int, bool)
	constructor(gameSession, position, width, height, rotation, scale, alpha, color, fill ) {

		super(gameSession, position.x, position.y, 5, 5, 0, 1, 255);

		this.__horizontalSize = width;
		this.__verticalSize = height;

		this.strokeColor = this.p5.color(color);
		this.fillColor = this.p5.color(color);
		this.fill = fill;
		this.alpha = alpha;

	}

	update( x, y ) {

		parseInt(x);
		this.x = x;
		this.y = y;

	}


	render() {

	    // Now draw our shape (base game object should have already taken care of translation, rotation, and scale with begin/end render)
	    this.renderSetup();
	    this.p5.ellipse(this.x, this.y, this.horizontalSize, this.verticalSize);

	}

	renderSetup() {
	    // Style formatting
	    // Prevent scaling of the stroke weight when scaling the graphic
	    this.p5.strokeWeight((1 / this.scale) * this.strokeWeight);
	    // Set the stroke color
	      this.p5.stroke(this.p5.red(this.strokeColor), this.p5.green(this.strokeColor), this.p5.blue(this.strokeColor), this.alpha);
	    // Handle fill
	    if(this.fill){
	      this.p5.fill(this.p5.red(this.fillColor), this.p5.green(this.fillColor), this.p5.blue(this.fillColor), this.alpha );
	    }
	    else{
	      this.p5.noFill();
	   }


  }

  get horizontalSize() {
  	return this.__horizontalSize;
  }

  get verticalSize() {
  	return this.__verticalSize;
  }


}