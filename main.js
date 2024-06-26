import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import CannonDebugger from 'cannon-es-debugger'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import swal from 'sweetalert'
import { PLYLoader } from 'three/examples/jsm/Addons.js'
//import { GUI } from 'dat.gui'


// Setting these variables as global
let scene, camera, renderer;
let world, cannonDebugger;
let timeStep = 1/60; // update rate for the world

let ambientLight, directionalLight, light;

let groundMaterial, groundMesh, sideMaterial, carMaterial;

let easterEgg = false;

let meshesArray = []; // gathering all additional dynamic items
let bodiesArray = [];

let capsuleMesh, capsuleBody, baseMesh, baseBody; // goal variables

let carBody, carMesh; // car without wheels
let vehicle; // full body of the car
let wheelBody1, wheelBody2, wheelBody3, wheelBody4;
let wheelMesh1, wheelMesh2, wheelMesh3, wheelMesh4;
let maxSteerVal = Math.PI / 8; // steer of the car
let maxForce = 100; // max force on the car

let rampExists = false; // flag for the button

//let gui = new GUI();

let doorOpen = false;
let leftDoorBody, rightDoorBody; // door bodies
let leftDoorMesh, rightDoorMesh; // door meshes

let startTime, timerInterval, currentTime; // timer

let buttonBody1, buttonBody2; // buttons
let buttonMat1, buttonMat2; // buttons' materials

let chaseCam, chaseCamPilot; // chase camera
let view = new THREE.Vector3(); // world position of the camera

const textureLoader = new THREE.TextureLoader(); // texture loader

// Setup
initScene();
initWorld();
initChaseCam();
createGround(); // create the "earth"
createCar();
createRoof(); // columns + glass cubes
createButtons(); // logical buttons for the game
createDoor(); 
createFence();
createWalls(); // so that the map is limited
createGoal(); // item to retrieve in order to win
startTimer(); // keep the time 
animate();




function initScene(){
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.CubeTextureLoader()
    .setPath('./src/')
    .load([
        'posx.jpg',
        'negx.jpg',
        'posy.jpg',
        'negy.jpg',
        'posz.jpg',
        'negz.jpg'
    ]);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);

    // Renderer
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    document.body.appendChild(renderer.domElement);

    // Lighting
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // color, intensity
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 1); // color, intensity
    directionalLight.position.set(-110, 700, 1000);
    directionalLight.castShadow = true;

    // Set up shadow properties for the light
    directionalLight.shadow.mapSize.width = 4096; // default is 512
    directionalLight.shadow.mapSize.height = 4096; // default is 512
    directionalLight.shadow.camera.near = 1; // default is 0.5
    directionalLight.shadow.camera.far = 2000; // default is 500
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;

    scene.add(directionalLight);
}

function initChaseCam(){
    chaseCam = new THREE.Object3D();
    chaseCam.position.set(0,0,0);
    chaseCam.rotation.set(0, -Math.PI / 2, 0);

    chaseCamPilot = new THREE.Object3D();
    chaseCamPilot.position.set(0, 8, -20);

    chaseCam.add(chaseCamPilot); // child 

    scene.add(chaseCam);
}



// Cannon.js world
function initWorld(){
    world = new CANNON.World();
    world.gravity.set(0, -9.81, 0);

    cannonDebugger = new CannonDebugger(scene, world, {
        color: 0xffffff,
        scale: 1.0
    });

}


function createGround(){
    groundMaterial = new CANNON.Material("groundMaterial");

    const groundShape = new CANNON.Plane(); // infinite
    const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        material: groundMaterial
    });

    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    world.addBody(groundBody);

    // texture 
    const groundTexture = textureLoader.load("./textures/texture.jpg");
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(24, 24);

    const groundMat = new THREE.MeshLambertMaterial({
        map: groundTexture,
        color: 0x38761d // dark green
    });
    const groundGeo = new THREE.BoxGeometry(1000, 2, 1000);

    groundMesh = new THREE.Mesh(groundGeo, groundMat);
    scene.add(groundMesh);
    groundMesh.position.set(0, -1, 0);

    groundMesh.receiveShadow = true;
}

function createCar(){
    carMaterial = new CANNON.Material("carMaterial");

    const normalGround = new CANNON.ContactMaterial(groundMaterial, carMaterial, {
        friction: 0.8,
        restitution: 0,
        contactEquationStiffness: 1000
    });

    world.addContactMaterial(normalGround);

    // Shape and 
    const carShape = new CANNON.Box(new CANNON.Vec3(4, 0.5, 2));
    carBody = new CANNON.Body({
        mass: 6,
        material: carMaterial,
        shape: carShape,
        position: new CANNON.Vec3(0,6,0),
    });

    carBody.angularDamping = 0.9; // reduce flipping (NEEDED!)

    carBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);

    vehicle = new CANNON.RigidVehicle({
        chassisBody: carBody
    });

    addWheels();

    vehicle.addToWorld(world);

    // car mesh (gltf)
    const Gloader = new GLTFLoader();
    Gloader.load("./models/scene.gltf", function(gltf){
        carMesh = gltf.scene;
        carMesh.scale.set(3, 3, 3);
        carMesh.position.copy(carBody.position);
        carMesh.quaternion.copy(carBody.quaternion);

        carMesh.add(chaseCam);
        scene.add(carMesh);

        carMesh.traverse(function(node) {
            if(node.isMesh) {node.castShadow = true;}
        });
    });

    createMeshes();

    
}

function addWheels(){
    const mass = 0.5;
    const axisWidth = 5;
    const wheelShape = new CANNON.Sphere(1);
    const wheelMaterial = new CANNON.Material('carMaterial');
    const down = new CANNON.Vec3(0,-1,0); // direction vector


    // First wheel
    wheelBody1 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody1.addShape(wheelShape);
    wheelBody1.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody1,
      position: new CANNON.Vec3(-2, 0, axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
      dampingRelaxation: 2.3,
      dampingCompression: 4.5,
      suspensionStiffness: 45,
      useCustomSlidingRotationalSpeed: true,
      customSlidingRotationalSpeed: -30
      
    });

    // Second wheel
    wheelBody2 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody2.addShape(wheelShape);
    wheelBody2.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody2,
      position: new CANNON.Vec3(-2, 0, -axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
    });

    // Third wheel
    wheelBody3 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody3.addShape(wheelShape);
    wheelBody3.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody3,
      position: new CANNON.Vec3(2, 0, axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
    });

    // Fourth wheel
    wheelBody4 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody4.addShape(wheelShape);
    wheelBody4.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody4,
      position: new CANNON.Vec3(2, 0, -axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
    });
}

function createRamp(){
    sideMaterial = new CANNON.Material("sideMaterial"); 
    const woodContactMaterial = new CANNON.ContactMaterial(carMaterial, sideMaterial, {
        friction: 0.9,
        restitution: 0
    })
    world.addContactMaterial(woodContactMaterial);

    const rampShape = new CANNON.Box(new CANNON.Vec3(6,1,179));
    const rampBody = new CANNON.Body({
        mass: 0,
        shape: rampShape,
        material: sideMaterial,  
    });
    rampBody.position = new CANNON.Vec3(30, 9, -55);
    rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 13);

    world.addBody(rampBody);

    // Ramp Mesh
    const rampTexture = textureLoader.load("./textures/ice.jpg");
    rampTexture.wrapS = THREE.RepeatWrapping;
    rampTexture.wrapT = THREE.RepeatWrapping;
    rampTexture.repeat.set(2, 2);
    const rampMat = new THREE.MeshPhysicalMaterial({color: 0x8b6914, map: rampTexture, roughness: 0.8, metalness: 0});
    const rampGeo = new THREE.BoxGeometry(12, 2, 348);

    const rampMesh = new THREE.Mesh(rampGeo, rampMat);
    scene.add(rampMesh);
    rampMesh.position.copy(rampBody.position);
    rampMesh.quaternion.copy(rampBody.quaternion);

    rampMesh.receiveShadow = true;
    rampMesh.castShadow = true;
}

function createRoof(){
    // side columns (4x4 squares)
    const sideShape = new CANNON.Box(new CANNON.Vec3(4, 60, 4));
    sideMaterial = new CANNON.Material();
    const leftBody = new CANNON.Body({
        mass: 0,
        shape: sideShape,
        material: groundMaterial,
    });
    const rightBody = new CANNON.Body({
        mass: 0,
        shape: sideShape,
        material: groundMaterial
    });
    leftBody.position = new CANNON.Vec3(-37, 0, 120);
    rightBody.position = new CANNON.Vec3(30, 0, 120);

    world.addBody(leftBody);
    world.addBody(rightBody);


    //roof mesh
    const roofMat = new THREE.MeshPhysicalMaterial({
        color: 0xd3c3a2,
        roughness: 0.2,
        transmission: 1,
        thickness: 1,
        ior: 2.33
    });
    const sideGeo = new THREE.BoxGeometry(8, 120, 8);

    const leftMesh = new THREE.Mesh(sideGeo, roofMat);
    scene.add(leftMesh);

    const rightMesh = new THREE.Mesh(sideGeo, roofMat);
    scene.add(rightMesh);

    leftMesh.position.copy(leftBody.position);
    rightMesh.position.copy(rightBody.position);

    leftMesh.castShadow = true;
    rightMesh.castShadow = true;

    // upper part
    let previous;
    const mass = 2;
    const size = 4;
    const space = size * 0.1;
    const shape = new CANNON.Box(new CANNON.Vec3(size, size, size));
    const N = 10;
    const geo = new THREE.BoxGeometry(2*size, 2*size, 2*size);

    for(let i = 0; i < N; i++){
        const boxBody = new CANNON.Body({
            shape,
            mass,
            position: new CANNON.Vec3(-(N-i-N/2) * (size*2 + space*2), 70, 120)
        });
        world.addBody(boxBody);
        bodiesArray.push(boxBody);
        
        const upMat = new THREE.MeshPhysicalMaterial({
            metalness: 0,
            roughness: 0,
            transmission: 1
        });
        upMat.color.set("#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0"));
        const mesh = new THREE.Mesh(geo, upMat);
        scene.add(mesh);
        meshesArray.push(mesh);

        mesh.castShadow = true;

        if(previous){
            const lockConstraint = new CANNON.LockConstraint(boxBody, previous);
            world.addConstraint(lockConstraint);
        }
        previous = boxBody;
    }

}

function createBall(){
    const ballGeo = new THREE.SphereGeometry(4, 30, 30);

    const ballPhyMat = new CANNON.Material("ballMaterial");
    const ballContact = new CANNON.ContactMaterial(
        groundMaterial,
        ballPhyMat,
        {restitution: 0.2, friction: 1}
    );

    world.addContactMaterial(ballContact);

    for(let i=0; i < 10; i++){
        const randomColor = Math.random() * 0xffffff;
        const ballMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({
            color: randomColor,
            metalness: 0,
            roughness: 0
        }));
        const ballBody = new CANNON.Body({
            mass: 24,
            shape: new CANNON.Sphere(2),
            material: ballPhyMat
        });
        ballBody.position = new CANNON.Vec3(i % 2 == 0 ? (-10 + i*4) : -15 - i*2 , 100, 130+18*i);
        ballMesh.position.copy(ballBody.position);

        scene.add(ballMesh);
        world.addBody(ballBody);

        ballMesh.castShadow = true;
        ballMesh.receiveShadow = true;

        meshesArray.push(ballMesh);
        bodiesArray.push(ballBody);
    }

}


function createWalls(){
    let wallMesh1; 
    let wallMesh2;
    let wallMesh3;

    const wallShape = new CANNON.Box(new CANNON.Vec3(500, 80, 15));

    const wallBody1 = new CANNON.Body({
        mass: 0,
        shape: wallShape,
        material: groundMaterial,
        position: new CANNON.Vec3(0, 60, -300)
    });
    world.addBody(wallBody1);

    // mesh first wall
    const wallTexture = textureLoader.load("./textures/stone.jpg");
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(1.5, 1.5);

    const wallGeo = new THREE.BoxGeometry(1000, 240, 30);
    const wallMat = new THREE.MeshLambertMaterial({
        map: wallTexture,
        color: 0x9a5938,
    });
    

    wallMesh1 = new THREE.Mesh(wallGeo, wallMat);
    scene.add(wallMesh1);
    wallMesh1.position.copy(wallBody1.position);

    wallMesh1.receiveShadow = true;



    // body second wall
    const smallShape = new CANNON.Box(new CANNON.Vec3(300, 80, 30));
    const wallBody2 = new CANNON.Body({
        mass: 0,
        shape: smallShape,
        material: groundMaterial,
        position: new CANNON.Vec3(260, 60, -80),
    });
    wallBody2.quaternion.setFromEuler(0, Math.PI / 2, 0);
    world.addBody(wallBody2);

    // mesh second wall (barn)
    const Gloader = new GLTFLoader();
    Gloader.load("./models/barn.glb", function(gltf){
        wallMesh2 = gltf.scene;
        wallMesh2.scale.set(250, 250, 250);
        wallMesh2.position.copy(wallBody2.position);
        wallMesh2.position.x += 185;
        wallMesh2.position.y += 44;
        wallMesh2.position.z += 30;
        wallMesh2.rotation.z += 0.09;


        scene.add(wallMesh2);

        wallMesh2.traverse(function(node) {
            if(node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
    });

    // third wall
    const wallBody3 = new CANNON.Body({
        mass:0,
        shape: wallShape,
        material: groundMaterial,
        position: new CANNON.Vec3(-240, 60, -80)
    });
    wallBody3.quaternion.setFromEuler(0, -Math.PI / 2, 0);
    world.addBody(wallBody3);

    wallMesh3 = new THREE.Mesh(wallGeo, wallMat);
    scene.add(wallMesh3);
    wallMesh3.position.copy(wallBody3.position);
    wallMesh3.quaternion.copy(wallBody3.quaternion);

    wallMesh3.receiveShadow = true;
    wallMesh3.castShadow = true;
}

function createButtons(){
    const buttonShape = new CANNON.Cylinder(1, 5, 0.2);
    buttonBody1 = new CANNON.Body({
        mass: 0,
        shape: buttonShape,
        material: groundMaterial,
        position: new CANNON.Vec3(30, 55, 116)
    });
    buttonBody1.quaternion.setFromEuler(-Math.PI/2, 0, 0);

    buttonBody2 = new CANNON.Body({
        mass: 0,
        shape: buttonShape,
        material: groundMaterial,
        position: new CANNON.Vec3(-37, 4, 116)
    });
    buttonBody2.quaternion.copy(buttonBody1.quaternion);

    world.addBody(buttonBody1);
    world.addBody(buttonBody2);

    buttonMat1 = new THREE.MeshPhongMaterial({color: 0xff0000});
    buttonMat2 = new THREE.MeshPhongMaterial({color: 0xff0000});

    const buttonGeo = new THREE.CylinderGeometry(2, 2, 0.4);

    const buttonMesh1 = new THREE.Mesh(buttonGeo, buttonMat1);
    scene.add(buttonMesh1);

    const buttonMesh2 = new THREE.Mesh(buttonGeo, buttonMat2);
    scene.add(buttonMesh2);

    buttonMesh1.position.copy(buttonBody1.position);
    buttonMesh1.quaternion.copy(buttonBody1.quaternion);

    buttonMesh2.position.copy(buttonBody2.position);
    buttonMesh2.quaternion.copy(buttonBody2.quaternion);

}

function createDoor(){
    // BODIES
    // Left Door 
    const doorShape = new CANNON.Box(new CANNON.Vec3(13, 25, 2));
    leftDoorBody = new CANNON.Body({
        mass: 0,
        shape: doorShape,
        material: groundMaterial 
    });
    leftDoorBody.position = new CANNON.Vec3(12, 25, 120);
    world.addBody(leftDoorBody);

    // Right Door
    rightDoorBody = new CANNON.Body({
        mass: 0,
        shape: doorShape,
        material: groundMaterial
    });
    rightDoorBody.position = new CANNON.Vec3(-17, 25, 120);
    world.addBody(rightDoorBody);


    // MESHES
    // Left Door 
    const doorGeometry = new THREE.BoxGeometry(26, 50, 4, 20, 20, 20);
    const doorMaterial = new THREE.MeshPhysicalMaterial({color: 0xb9e8ea, wireframe: true, roughness: 0.2, metalness: 0.8});
    leftDoorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
    scene.add(leftDoorMesh);

    leftDoorMesh.position.copy(leftDoorBody.position);
    meshesArray.push(leftDoorMesh);
    bodiesArray.push(leftDoorBody);

    // Right Door color: 0xb9e8ea,
    rightDoorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
    scene.add(rightDoorMesh);

    rightDoorMesh.position.copy(rightDoorBody.position);
    meshesArray.push(rightDoorMesh);
    bodiesArray.push(rightDoorBody); 
    
    leftDoorMesh.castShadow = true;
    leftDoorMesh.receiveShadow = true;
    rightDoorMesh.castShadow = true;
    rightDoorMesh.receiveShadow = true;

}

function createFence(){
    let leftFenceMesh;
    let rightFenceMesh;

    const fenceTexture= textureLoader.load("./textures/fence.jpg");
    fenceTexture.wrapS = THREE.RepeatWrapping;
    fenceTexture.wrapT = THREE.RepeatWrapping;
    fenceTexture.repeat.set(0.2, 0.2);

    const fenceGeo = new THREE.BoxGeometry(180, 30, 8, 50, 50);
    const fenceMat = new THREE.MeshPhysicalMaterial({
        map: fenceTexture,
        color: 0xdcf3ff,
        roughness: 0.2,
        transmission: 0.2,
        thickness: 1,
        metalness: 0.8,
        wireframe: true
    });
    
    leftFenceMesh = new THREE.Mesh(fenceGeo, fenceMat);
    leftFenceMesh.position.set(125, 10, 120);

    rightFenceMesh = new THREE.Mesh(fenceGeo, fenceMat);
    rightFenceMesh.position.set(-132, 10, 120);

    scene.add(leftFenceMesh);
    scene.add(rightFenceMesh);

    leftFenceMesh.castShadow = true;
    leftFenceMesh.receiveShadow = true;

    rightFenceMesh.castShadow = true;
    rightFenceMesh.receiveShadow = true;
}

function createGoal(){
    const marble = textureLoader.load("textures/marble.jpg");
    marble.wrapS = THREE.RepeatWrapping;
    marble.wrapT = THREE.RepeatWrapping;

    // base for the statue
    const baseGeo = new THREE.CylinderGeometry(13, 13, 3);
    const baseMat = new THREE.MeshLambertMaterial();
    baseMesh = new THREE.Mesh(baseGeo, baseMat);
    scene.add(baseMesh);

    const baseShape = new CANNON.Cylinder(6.5, 6.5, 1.5);
    baseBody = new CANNON.Body({
        shape: baseShape,
        mass: 0,
    });
    baseBody.position = new CANNON.Vec3(-5, 0, 300);
    baseMesh.position.copy(baseBody.position);
    world.addBody(baseBody);

    const capsuleShape = new CANNON.Cylinder(3, 3, 6);
    capsuleBody = new CANNON.Body({
        shape: capsuleShape,
        mass: 0
    });
    capsuleBody.position = new CANNON.Vec3(-5, 5, 300);
    world.addBody(capsuleBody);


    new PLYLoader().load('models/Lucy.ply', function(geometry){

        geometry.scale( 0.02, 0.02, 0.02 );
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({map: marble});

        capsuleMesh = new THREE.Mesh( geometry, material );
        capsuleMesh.position.set(-5, 10, 300);
        capsuleMesh.rotation.y = -Math.PI / 5;
        capsuleMesh.castShadow = true;
        capsuleMesh.receiveShadow = true;
        scene.add( capsuleMesh );

    } );
}


// EVENT SECTION

// handlers for the buttons
buttonBody1.addEventListener('collide', (event) => {
    if(event.body.material){
        if(event.body.material.name === "carMaterial" && !doorOpen){
            buttonMat2.color.setHex(0xff0000);
            buttonMat1.color.setHex(0x00ff00);
            openDoor();
            easterEgg = true;
        }
    }
});

buttonBody2.addEventListener('collide', (event) => {
    if(event.body.material.name === "carMaterial"){
        if(easterEgg){
            createBall();
            easterEgg = false;
            buttonMat2.color.setHex(0x0000ff);
        }
        if(!rampExists){
            rampExists = true;
            createRamp();
            buttonMat2.color.setHex(0x00ff00);
            buttonMat1.color.setHex(0xff0000);
        }
    }
});

// end of the game
baseBody.addEventListener('collide', (event) => {
    if(event.body.material){
        if(event.body.material.name === 'carMaterial' && doorOpen){
            doorOpen = false;
            stopTimer();
            swal("Congratulations!", `Your time was: ${document.getElementById('timer').textContent}`, "success", {
                buttons: {
                    visit: {
                        text: "Visit threejs.org",
                        value: 'visit'
                    },
                    quit: true,
                },
            }).then((value) => {
                console.log(value);
                switch ( value) {
                    case "visit":
                        window.location.replace('http://threejs.org');
                        break;
                    case "quit":
                        window.location.replace("https://www.uniroma1.it/it/pagina-strutturale/home");
                        break;
                }   
            });
        }
    }
})


// Commands to move car
// MOVE
document.addEventListener('keydown', (event) => {
    switch(event.key){
        case 'a':
            vehicle.setSteeringValue(maxSteerVal, 0);
            vehicle.setSteeringValue(maxSteerVal, 1);
            break;

        case 'd':
            vehicle.setSteeringValue(-maxSteerVal, 0);
            vehicle.setSteeringValue(-maxSteerVal, 1);
            break;

        case 'w':
            vehicle.setWheelForce(maxForce, 0);
            vehicle.setWheelForce(maxForce, 1);
            break;

        case 's':
            vehicle.setWheelForce(-maxForce / 2, 0);
            vehicle.setWheelForce(-maxForce / 2, 1);
            break;

        case ' ':
            resetCar();
            break;
        
        // debug
        case 'k':
            openDoor();
            break;

        case 'l':
            createBall();
            break;
    }
});

// STOP
document.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'w':
        vehicle.setWheelForce(0, 0);
        vehicle.setWheelForce(0, 1);
        break;

      case 's':
        vehicle.setWheelForce(0, 0);
        vehicle.setWheelForce(0, 1);
        vehicle.setWheelForce(0,2);
        vehicle.setWheelForce(0,3);
        break;

      case 'a':
        vehicle.setSteeringValue(0, 0);
        vehicle.setSteeringValue(0, 1);
        break;

      case 'd':
        vehicle.setSteeringValue(0, 0);
        vehicle.setSteeringValue(0, 1);
        break;
    }
});

// Create the meshes for the vehicle (wheels)
function createMeshes(){
    const wheelGeo = new THREE.SphereGeometry(1);
    const wheelMat = new THREE.MeshNormalMaterial({transparent: true, opacity: 0});

    wheelMesh1 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh1);

    wheelMesh2 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh2);

    wheelMesh3 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh3);

    wheelMesh4 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh4);
}

function resetCar(){
    scene.remove(carMesh);
    vehicle.removeFromWorld(world);
    createCar();
}

// switch from day to night
function openDoor(){
    if(!doorOpen){
        doorOpen = true;

        // new ambient light
        const ambient = new THREE.HemisphereLight( 0xffffff, 0x8d8d8d, 0.15 );
		scene.add( ambient );

        // spotlight for the goal
        light = new THREE.SpotLight(0xffffff, 8000);
        light.position.set(30, 30, 250);
        light.angle = Math.PI / 6;
        light.penumbra = 1;
        light.decay = 2;

        // texture of light
        const text = textureLoader.load('./textures/cool.jpg', () => {
            light.map=text;
        });
        text.minFilter = THREE.LinearFilter;
        text.magFilter = THREE.LinearFilter;
        text.colorSpace = THREE.SRGBColorSpace;

        light.castShadow = true;
        light.target = capsuleMesh;
        light.shadow.mapSize.width = 1024;
		light.shadow.mapSize.height = 1024;
		light.shadow.camera.near = 1;
		light.shadow.camera.far = 100;
		light.shadow.focus = 1;
        scene.add(light);


        //debug
        //const lightHelper = new THREE.SpotLightHelper(light);
        //scene.add(lightHelper);

        scene.background = new THREE.CubeTextureLoader()
        .setPath('./src/night/')
        .load([
            'posx.jpg',
            'negx.jpg',
            'posy.jpg',
            'negy.jpg',
            'posz.jpg',
            'negz.jpg'
        ]);

        ambientLight.visible = false;
        directionalLight.intensity = 0.2;
        directionalLight.position.set(-35, 100, -200);

        // blackish ground
        groundMesh.material.color = 0xFF5733;

        // opens the door
        rightDoorBody.quaternion.setFromEuler(0, -Math.PI / 2, 0);
        leftDoorBody.quaternion.setFromEuler(0, Math.PI / 2, 0);
        rightDoorBody.position.set(-36, 25, 136);
        leftDoorBody.position.set(29, 25, 136);
    };

}


function animate(){
    //cannonDebugger.update();
    
    world.step(timeStep);

    updateCar();
    updateChaseCam();

    if(bodiesArray){
        updateItems();
    }

    if(capsuleMesh && light && baseMesh){
        updateGoal();
    }


    renderer.render(scene, camera);
    
    requestAnimationFrame(animate);
}

function startTimer(){
    startTime = performance.now();
    timerInterval = setInterval(updateTimer, 10);
}

function stopTimer(){
    clearInterval(timerInterval);
}


// UPDATE FUNCTIONS
// Update sync between mesh and body
function updateCar(){
    if(carMesh){
        carMesh.position.copy(carBody.position);
        carMesh.quaternion.copy(carBody.quaternion);
        camera.lookAt(carMesh.position);
    }

    wheelMesh1.position.copy(wheelBody1.position);
    wheelMesh1.quaternion.copy(wheelBody1.quaternion);

    wheelMesh2.position.copy(wheelBody2.position);
    wheelMesh2.quaternion.copy(wheelBody2.quaternion);

    wheelMesh3.position.copy(wheelBody3.position);
    wheelMesh3.quaternion.copy(wheelBody3.quaternion);

    wheelMesh4.position.copy(wheelBody4.position);
    wheelMesh4.quaternion.copy(wheelBody4.quaternion);

}

function updateGoal(){
    const time = performance.now() / 3000;
	light.position.x -= Math.cos(time) / 10;
	light.position.z += Math.sin(time) / 10;
}

function updateItems(){
    for (let i = 0; i < meshesArray.length; i++) {
        if(meshesArray[i]){
            meshesArray[i].position.copy(bodiesArray[i].position);
            meshesArray[i].quaternion.copy(bodiesArray[i].quaternion);
            if(bodiesArray[i].material){
                if(bodiesArray[i].material.name === 'ballMaterial'){
                    meshesArray[i].position.y += 2;
                }
            }
        }
        
    }
}

function updateChaseCam(){
    chaseCamPilot.getWorldPosition(view);
    if (view.y < 1) view.y = 1; // y always positive to avoid camera flip

    camera.position.lerpVectors(camera.position, view, 0.3); // gap between camera and car
}


function updateTimer(){
    currentTime = performance.now();
    const elapsedTime = currentTime - startTime;

    const totalSeconds = Math.floor(elapsedTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor(elapsedTime % 1000);

    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');
    const formattedMilliseconds = milliseconds.toString().padStart(3, '0');

    document.getElementById('timer').textContent = `${formattedMinutes}:${formattedSeconds}:${formattedMilliseconds}`;

}
// Adapt to window resize
function onWindowResize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);
