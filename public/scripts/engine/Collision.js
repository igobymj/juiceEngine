/*
  Collision class
  
  The Collision class is a helper class with static collision methods for various types of collision detection.
  Current collision detection supported includes:
  - Line to Line
  - Circle to Circle
  - Point to Polygon
  - Line to Polygon
  - Polygon to Polygon
  
  Some of the collision detection code is adapted or modified from
  http://www.jeffreythompson.org/collision-detection/
  
  By Eddie Melcer
  Last Updated 4/14/22
*/

export default class Collision{
  // The circle2CircleCollision method tests to see if a circle intersects another circle. This method takes the following parameters:
  // p5.Vector circle1Position, float circle1Radius, p5.Vector circle2Position, float circle2Radius
  static Circle2CircleCollision(circle1Position, circle1Radius, circle2Position, circle2Radius){
    // Get distance between the circles' centers using the Pythagorean Theorem
    let distanceX = circle1Position.x - circle2Position.x;
    let distanceY = circle1Position.y - circle2Position.y;
    let distance = Math.sqrt(Math.pow(distanceX, 2) + Math.pow(distanceY, 2));

    // If the distance is less than the sum of the circles' radii, then the circles are touching
    if (distance <= circle1Radius + circle2Radius) {
      return true;
    }
    
    return false;
  }
  
  // The Line2LineCollision method tests to see if a line intersects another line. This method takes the following parameters:
  // p5.Vector line1StartPoint, p5.Vector line1EndPoint, p5.Vector line2StartPoint, p5.Vector line2EndPoint
  static Line2LineCollision(line1StartPoint, line1EndPoint, line2StartPoint, line2EndPoint){
    // To check if two lines are touching, we have to calculate the distance to the point of intersection
    let uA = ((line2EndPoint.x - line2StartPoint.x) * (line1StartPoint.y-line2StartPoint.y) - (line2EndPoint.y - line2StartPoint.y) * (line1StartPoint.x - line2StartPoint.x)) /
          ((line2EndPoint.y - line2StartPoint.y) * (line1EndPoint.x - line1StartPoint.x) - (line2EndPoint.x - line2StartPoint.x) * (line1EndPoint.y - line1StartPoint.y));
    let uB = ((line1EndPoint.x - line1StartPoint.x) * (line1StartPoint.y - line2StartPoint.y) - (line1EndPoint.y - line1StartPoint.y) * (line1StartPoint.x - line2StartPoint.x)) /
          ((line2EndPoint.y - line2StartPoint.y) * (line1EndPoint.x - line1StartPoint.x) - (line2EndPoint.x - line2StartPoint.x) * (line1EndPoint.y - line1StartPoint.y));

    // If uA and uB are between 0-1, lines are colliding
    if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {

      // For debugging, draw a circle where the lines meet
      /*let intersectionX = line1StartPoint.x + (uA * (line1EndPoint.x - line1StartPoint.x));
      let intersectionY = line1StartPoint.y + (uA * (line1EndPoint.y - line1StartPoint.y));
      fill(255,0,0);
      noStroke();
      ellipse(intersectionX,intersectionY, 20,20);*/

      return true;
    }
    
    // Otherwise there's no collision
    return false;
  }
  
  // The Point2PolygonCollision method tests to see if a point intersects a polygon shape. This method takes the following parameters:
  // p5.Vector point, p5.Vector array polygon
  static Point2PolygonCollision(point, polygon){
    //print(point);
    //print(polygon);
    let collision = false;
    
    // Go through each vertex in our polygon
    for(let current = 0; current < polygon.length; current++){
      // Also get the next vertex (wrap around to 0 after the end of the polygon)
      let next = (current+1) % polygon.length;
      
      // Get the correspoing point for current and next vertices
      let currentVertex = polygon[current];
      let nextVertex = polygon[next];
      
      // Check if the point is between the two vertices in the Y direction
      // Also do a second check using Jordan Curve Theorem
      // If both checks are true, switch collision to its opposite value
      // After going through all vertices, whatever the final state of the collision is becomes the result
      if (
        ((currentVertex.y >= point.y && nextVertex.y < point.y) ||
         (currentVertex.y < point.y && nextVertex.y >= point.y)) &&
        (point.x < (nextVertex.x - currentVertex.x) *
         (point.y - currentVertex.y) / (nextVertex.y - currentVertex.y) + currentVertex.x))
      {
        collision = !collision;
      }
    }
    
    return collision;
  }
  
  // The Line2PolygonCollision method tests to see if a line intersects a polygon. This method takes the following parameters:
  // p5.Vector lineStart, p5.Vector lineEnd, p5.Vector array polygon
  static Line2PolygonCollision(lineStart, lineEnd, polygon){
    // Go through each vertex in our polygon
    for(let current = 0; current < polygon.length; current++){
      // Also get the next vertex (wrap around to 0 after the end of the polygon)
      let next = (current+1) % polygon.length;
      
      // Get the correspoing point for current and next vertices
      let currentVertex = polygon[current];
      let nextVertex = polygon[next];
      
      // Check to see if the line intersects the line between the current and next vertex of the polygon
      // If it does then we have a collision of the line with the polygon
      if(Collision.Line2LineCollision(lineStart, lineEnd, currentVertex, nextVertex)){
        return true;
      }
    }
    
    // No collision
    return false;
  }

  // The Polygon2PolygonCollision method tests to see if a polygon intersects another polygon. This method takes the following parameters:
  // p5.Vector array polygon1, p5.Vector array polygon2
  static Polygon2PolygonCollision(polygon1, polygon2){
    // Go through each vertex in our 1st polygon
    for(let current = 0; current < polygon1.length; current++){
      // Also get the next vertex (wrap around to 0 after the end of the polygon1)
      let next = (current+1) % polygon1.length;
      
      // Get the correspoing point for current and next vertices in polygon1
      let currentVertex = polygon1[current];
      let nextVertex = polygon1[next];
      
      // Check to see if the line of one side of polygon 1 intersects with any line/side of polygon 2
      // If it does then we have a collision
      if(Collision.Line2PolygonCollision(currentVertex, nextVertex, polygon2)){
        return true;
      }      
    }
	
	// Edge case 1 check: if the 2nd polygon is INSIDE the first
    if(Collision.Point2PolygonCollision(polygon2[0], polygon1)){
      return true;
    }
      
    // Edge case 2 check: if the 1st polygon is INSIDE the second
    if(Collision.Point2PolygonCollision(polygon1[0], polygon2)){
      return true;
    }

    // No collision
    return false;
  }
}