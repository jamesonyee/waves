#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D Noise3;
uniform float uNoiseAmp;
uniform float uNoiseFreq;

//Lighting
in vec3 vMC;
in vec3 vN; // normal vector
in vec3 vL; // vector from point to light
in vec3 vE; // vector from point to eye

out vec4 fragColor;

vec3
RotateNormal( float angx, float angy, vec3 n )
{
        float cx = cos( angx );
        float sx = sin( angx );
        float cy = cos( angy );
        float sy = sin( angy );

        // rotate about x:
        float yp =  n.y*cx - n.z*sx;    // y'
        n.z      =  n.y*sx + n.z*cx;    // z'
        n.y      =  yp;
        // n.x      =  n.x;

        // rotate about y:
        float xp =  n.x*cy + n.z*sy;    // x'
        n.z      = -n.x*sy + n.z*cy;    // z'
        n.x      =  xp;
        // n.y      =  n.y;

        return normalize( n );
}

void main(void) {
  vec3 myColor = vec3(0.2, 0.2, .8); // Blue water color
  vec3 specularColor = vec3(1.0, 1.0, 1.0); // White reflection color
  
  vec4 nvx = texture( Noise3, uNoiseFreq*vMC );
	float angx = nvx.r + nvx.g + nvx.b + nvx.a  -  2.;	// -1. to +1.
  angx *= uNoiseAmp;

  vec4 nvy = texture( Noise3, uNoiseFreq*vec3(vMC.xy,vMC.z+0.5) );
	float angy = nvy.r + nvy.g + nvy.b + nvy.a  -  2.;	// -1. to +1.
	angy *= uNoiseAmp;

  vec3 Normal = normalize(vN);
  Normal = RotateNormal(angx, angy, Normal);

  vec3 Light = normalize(vL);
  vec3 Eye = normalize(vE);

  float uKa = .6;
  float uKs = .4;
  float uKd = .3;
  float uShininess = 100.; 

  vec3 ambient = uKa * myColor;
  
  float dd = max(dot(normalize(vN), Light), 0.0);
  vec3 diffuse = uKd * dd * myColor;

  float ss = 0.;
  if ( dot(Normal, Light) > 0. ){
    vec3 ref = normalize( reflect( -Light, Normal) );
    ss = pow( max( dot(Eye,ref),0. ), uShininess );
  }

  vec3 specular = uKs * ss * specularColor.rgb;
  fragColor = vec4( ambient + diffuse + specular, 1. );
}