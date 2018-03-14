let global = {};
let globalSettings = {
    food: {
        size: 5,
        goOff: 3,
    },
    worldStyle: {
        bgColor: '#efe8e8',
        borderColor: '#53ffca',
    },
    cellBehaviour: {
        diffSizeCellsPassing: 0.08, //Соотношение большего к меньшему
        startEnergy: 0.5, //От максимума
        deathEnergy: 0.2,
        growingProcess: 0.75, //От энергии
    },
    physics: {
        velocityConstant: 5,
        resistanceConstant: 0.01,
    },
    scrollCoef: 100
}

let world, statistic;




function setup() {
    global.canvas = createCanvas(1300, 640).canvas;
    global.mouseEventObj = {
        isMouseDown: false,
        lastLocation: createVector(0, 0),
    }

    global.WorldObject = class World {
        constructor(x, y, options) {
            let defaultOpt = {
                mass: 10,
                maxSpeed: 5
            };

            options = deepParseOpt(defaultOpt, options);

            this.location = createVector(x, y);
            this.velocity = createVector(0, 0);
            this.acceleration = createVector(0, 0);

            this.mass = options.mass;
            this.maxSpeed = options.maxSpeed;

        }

        applyForce(force) {
            let copyForce = force.copy();
            copyForce.div(this.mass)
            this.acceleration.add(copyForce);
        }

        update() {
            let resistanceForce = this.velocity.copy().setMag(-1 * globalSettings.physics.resistanceConstant * this.mass);
            this.applyForce(resistanceForce);

            this.velocity.add(this.acceleration).limit(this.maxSpeed);
            this.location.add(this.velocity);

            this.acceleration.mult(0);
        }

    }



    global.Food = class extends global.WorldObject {
        constructor(x, y, options = {}) {
            let defaultOpt = {
                energy: 100,
                color: '#1ebf24',
                type: 'grass' //meat
            };

            options = deepParseOpt(defaultOpt, options);

            let parentOpt = {
                mass: sq(globalSettings.food.size),
                maxSpeed: globalSettings.physics.velocityConstant
            }
            super(x, y, parentOpt);

            this.energy = options.energy;
            this.type = options.type;

            this.rotate = random(TWO_PI);
            this.color = color(options.color);

            this.radius = globalSettings.food.size;
        }

        draw() {
            let size = this.radius;
            let { x, y } = this.location;
            push();
            translate(x, y);
            rotate(this.rotate);
            fill(this.color);
            triangle(0, -size, -size, sqrt(size * size - (size / 2) * (size / 2)),
                size, sqrt(size * size - (size / 2) * (size / 2)));
            pop();
        }
    }
    global.Grass = class extends global.Food {
        constructor(x, y, energy = 100) {
            super(x, y, {
                energy,
                color: '#00ea24',
                type: 'grass'
            });
        }
    }
    global.Meat = class extends global.Food {
        constructor(x, y, energy = 100) {
            super(x, y, {
                energy,
                color: '#d30909',
                type: 'meat'
            });
        }
    }




    global.Cell = class extends global.WorldObject {
        constructor(x, y, options = {}) {
            let defaultOpt = {
                radius: 20,
                color: 'rgb(175, 175, 175)',
                maxSteerForce: 5,
                maxEnergy: 1000,
                type: 'grass', //meat
                visorRadius: 60,
                world: {},
                species: 'cell'
            }
            options = deepParseOpt(defaultOpt, options, true);

            let parentOpt = {
                mass: sq(options.radius),
                maxSpeed: globalSettings.physics.velocityConstant
            }
            super(x, y, parentOpt);
            this._options = options;

            this.id = global.Cell.getId();
            this.species = options.species;

            this.maxRadius = options.radius
            this.radius = 0.5 * this.maxRadius;
            this.age = 0;

            this.color = color(options.color);
            this.type = options.type;

            this.maxSteerForce = options.maxSteerForce;

            this.maxEnergy = options.maxEnergy;
            this.energy = globalSettings.cellBehaviour.startEnergy * this.maxEnergy;

            this.visorRadius = options.visorRadius;

            this.visibleObjects = {
                food: {
                    grass: [],
                    meat: []
                },
                cells: []
            };

            this.world = options.world;
            this.steer = new global.CellSteer(this);
        }

        updateVisibleObjects(food, cells) {
            this.visibleObjects = {
                food: {
                    grass: [],
                    meat: []
                },
                cells: []
            };

            food.grass.forEach(item => {
                this.visibleObjects.food.grass.push(item);
            });
            food.meat.forEach(item => {
                this.visibleObjects.food.meat.push(item);
            });
            cells.forEach(item => {
                this.visibleObjects.cells.push(item);
            });
        }

        getWorld() {
            return this.world;
        }

        die() {
            let foodArr = [];
            let countFood = round(sq(this.radius) / sq(globalSettings.food.size));
            for (let i = 0; i < countFood; ++i) {
                let foodPos = createVector(this.location.x, this.location.y);
                let foodForce = createVector(random(-this.radius, this.radius), random(-this.radius, this.radius));
                foodForce.mult(globalSettings.food.goOff);
                foodArr.push(new global.Meat(foodPos.x, foodPos.y, this.energy / countFood));
                foodArr[foodArr.length - 1].applyForce(foodForce);
            }
            return foodArr
        }

        eat(food) {
            this.energy += food.energy;
        }

        calcAge() {
            if (this.age >= 1)
                return;

            let ageDependOfEnergy = map(this.energy,
                globalSettings.cellBehaviour.startEnergy * this.maxEnergy,
                globalSettings.cellBehaviour.growingProcess * this.maxEnergy, 0, 1);
            if (ageDependOfEnergy <= this.age)
                return;

            if (ageDependOfEnergy > 1)
                this.age = 1;
            else
                this.age = ageDependOfEnergy;

            this.radius = 0.5 * this.maxRadius * (1 + this.age);
            this.mass = sq(this.radius);
        }

        checkFission() {
            if (this.age === 1 && this.energy >= globalSettings.cellBehaviour.growingProcess * this.maxEnergy) {
                let cell_1 = new this.constructor(this.location.x, this.location.y, this._options),
                    cell_2 = new this.constructor(this.location.x, this.location.y, this._options);

                this.getWorld().addCell(cell_1);
                this.getWorld().addCell(cell_2);

                let fissionForce = this.velocity.copy().rotate(HALF_PI);

                cell_1.applyForce(fissionForce);
                fissionForce.mult(-1);
                cell_2.applyForce(fissionForce);

                this.getWorld().cells = removeFromArr(this.getWorld().cells, this);
            }
        }

        update() {
            this.energy--;
            this.calcAge();
            this.checkFission();

            this.steer.update();
            this.acceleration.limit(this.maxSteerForce);

            //this.drawInfo();

            super.update();
        }

        display() {
            let cellColor = color(red(this.color),
                green(this.color),
                blue(this.color),
                map(this.energy, 0, this.maxEnergy, 0, 255));

            fill(cellColor);
            stroke(map(this.energy, 0, this.maxEnergy, 0, 255));
            push();
            translate(this.location.x, this.location.y);
            ellipse(0, 0, this.radius * 2, this.radius * 2);
            pop();
        }

        drawInfo() {
            push();
            translate(this.location.x, this.location.y);
            stroke(175);
            line(0, 0, this.acceleration.x * 150, this.acceleration.y * 150);
            fill('rgba(50, 50, 50, 0.2)');
            ellipse(0, 0, this.visorRadius, this.visorRadius);
            pop();
        }

        static getId() {
            return global.Cell.ID++;
        }
    }
    global.Cell.ID = 0;

    global.GrassEater = class extends global.Cell {
        constructor(x, y, options = {}) {
            let parentOpt = {
                color: '#00a733',
                type: 'grass',
                species: 'grass_eater'
            };
            Object.assign(parentOpt, options);
            super(x, y, parentOpt);
        }
    }
    global.MeatEater = class extends global.Cell {
        constructor(x, y, options = {}) {
            let parentOpt = {
                color: '#ac0000',
                type: 'meat',
                species: 'meat_eater'
            };
            Object.assign(parentOpt, options);
            super(x, y, parentOpt);
        }
    }




    global.CellSteer = class {
        constructor(cell) {
            this.cell = cell;

            //point of priority
            let pp = this.cell.maxSteerForce;

            this.listOfStates = {
                'SEARCH': {
                    algorithm: this.search.bind(this),
                    priority: pp,
                    first: true,
                    walls: {
                        directionID: '',
                    },
                    direction: createVector(0, 0)
                },
                'EAT_FOOD': {
                    algorithm: this.eatFood.bind(this),
                    priority: pp * 5
                },
                'SEPARATE': {
                    algorithm: this.separate.bind(this),
                    priority: pp * 20,
                    desiredSeparation: 1.1 * this.cell.radius
                }
            }

            if (this.cell.type === 'meat') {
                this.listOfStates['HUNT'] = {
                    algorithm: this.hunt.bind(this),
                    priority: pp * 2,
                    prognosis: 3
                }
            }

            if (this.cell.type === 'grass') {
                this.listOfStates['RUN'] = {
                    algorithm: this.run.bind(this),
                    priority: pp * 10
                }
            }
        }

        search() {
            if (this.listOfStates['SEARCH'].first) {
                this.listOfStates['SEARCH'].direction = createVector(random(-1, 1), random(-1, 1));
                this.listOfStates['SEARCH'].first = false;
            }
            let getOutOfWall = this.checkWallsAround();
            if (getOutOfWall) {
                this.listOfStates['SEARCH'].direction = getOutOfWall;
            }

            return this.listOfStates['SEARCH'].direction;
        }

        eatFood() {
            let arrOfVectorsToFood = [];

            let visibleFood;
            if (this.cell.type === 'grass') {
                visibleFood = this.cell.visibleObjects.food.grass;
            } else if (this.cell.type === 'meat') {
                visibleFood = this.cell.visibleObjects.food.meat;
            }

            if (visibleFood.length === 0)
                return createVector(0, 0);

            visibleFood.forEach(food => {
                arrOfVectorsToFood.push(
                    p5.Vector.sub(food.location, this.cell.location)
                );
            });

            // Минимальное расстояние
            return arrOfVectorsToFood.reduce((minItem, item) => {
                if (minItem.mag() > item.mag())
                    return item;
                return minItem;
            });
        }

        separate() {
            let sum   = createVector(0, 0),
                count = 0;

            this.cell.visibleObjects.cells.forEach(cell => {
                if (this.cell.species !== cell.species)
                    return;

                let d = p5.Vector.dist(this.cell.location, cell.location);

                if (d > 0 && d < this.listOfStates['SEPARATE'].desiredSeparation) {
                    let diff = p5.Vector.sub(this.cell.location, cell.location)
                                        .normalize()
                                        .div(d);
                    sum.add(diff);
                    count++;
                }
            });

            if (count > 0) {
                sum.div(count);
                sum.sub(this.cell.velocity);
            }
            return sum;
        }

        hunt() {
            let grassEaterVectorsArr = [];
            this.cell.visibleObjects.cells.forEach(cell => {
                if (cell.type === 'grass'
                    && global.World.proportional(cell.radius, this.cell.radius) > globalSettings.cellBehaviour.diffSizeCellsPassing
                    && this.cell.radius > cell.radius)
                    grassEaterVectorsArr.push( p5.Vector.sub(
                        cell.location.copy().add( cell.velocity.mult(this.listOfStates['HUNT'].prognosis) ),
                        this.cell.location )
                    );
            });

            if (grassEaterVectorsArr.length === 0)
                return createVector(0, 0);

            // Минимальное расстояние
            return grassEaterVectorsArr.reduce((minItem, item) => {
                if (minItem.mag() > item.mag())
                    return item;
                return minItem;
            });
        }

        run() {
            let direction = createVector(0, 0);
            let meatEaterVectorsArr = [];
            this.cell.visibleObjects.cells.forEach(cell => {
                if (cell.type === 'meat'
                    && global.World.proportional(cell.radius, this.cell.radius) > globalSettings.cellBehaviour.diffSizeCellsPassing
                    && this.cell.radius < cell.radius)
                    meatEaterVectorsArr.push( p5.Vector.sub(this.cell.location, cell.location) );
            });

            if (meatEaterVectorsArr.length === 0)
                return direction;

            meatEaterVectorsArr.forEach(item => {
                direction.add(item);
            });
            direction.div(meatEaterVectorsArr.length);
            direction.sub(this.cell.velocity);

            return direction;
        }

        update() {
            for (let behaviour in this.listOfStates) {
                let newBehaviourVector = this.listOfStates[behaviour].algorithm();
                newBehaviourVector.setMag(this.listOfStates[behaviour].priority);
                this.cell.applyForce(newBehaviourVector);
            }
        }

        /*
            Вернёт вектор, куда можно переместиться или false
        */
        checkWallsAround() {
            const { height, width } = this.cell.world.sizes,
                  { visorRadius } = this.cell;
            let allowAngleRange = {
                ne: {
                    allowed: true,
                    start: 1,
                    finish: 89
                },
                nw: {
                    allowed: true,
                    start: 91,
                    finish: 179
                },
                sw: {
                    allowed: true,
                    start: 181,
                    finish: 269
                },
                se: {
                    allowed: true,
                    start: 271,
                    finish: 359
                },
                e: {
                    allowed: true,
                    start: 0,
                    finish: 0
                },
                n: {
                    allowed: true,
                    start: 90,
                    finish: 90
                },
                w: {
                    allowed: true,
                    start: 180,
                    finish: 180
                },
                s: {
                    allowed: true,
                    start: 270,
                    finish: 270
                }
            };

            if (this.cell.location.x + visorRadius >= width) {
                allowAngleRange.ne.allowed = allowAngleRange.se.allowed = allowAngleRange.e.allowed = false;
            }

            if (this.cell.location.x - visorRadius <= 0) {
                allowAngleRange.nw.allowed = allowAngleRange.sw.allowed = allowAngleRange.w.allowed = false;
            }

            if (this.cell.location.y + visorRadius >= height) {
                allowAngleRange.se.allowed = allowAngleRange.sw.allowed = allowAngleRange.s.allowed = false;
            }

            if (this.cell.location.y - visorRadius <= 0) {
                allowAngleRange.ne.allowed = allowAngleRange.nw.allowed = allowAngleRange.n.allowed = false;
            }



            //Проверка, были ли вообще стены
            let countDirection = 0,
                countAllowed = 0;
            let tempDirectionId = '';
            for (let direction in allowAngleRange) {
                countDirection++;
                if (allowAngleRange[direction].allowed) {
                    countAllowed++;
                    tempDirectionId += '1';
                } else {
                    tempDirectionId += '0';
                }
            }

            if (countDirection === countAllowed || this.listOfStates['SEARCH'].walls.directionID === tempDirectionId) {
                return false;
            }
            this.listOfStates['SEARCH'].walls.directionID = tempDirectionId;

            //Что-то ничего лучше не придумал
            let indexOfAllowedAngles = [];
            for (let direction in allowAngleRange) {
                if (allowAngleRange[direction].allowed) {
                    for (let i = allowAngleRange[direction].start; i <= allowAngleRange[direction].finish; ++i) {
                        indexOfAllowedAngles.push(i);
                    }
                }
            }

            let randomAngle = radians(-indexOfAllowedAngles[round(random(indexOfAllowedAngles.length - 1))]);
            return p5.Vector.fromAngle(randomAngle);
        }
    }




    global.World = class {
        constructor(options) {
            let defaultOpt = {
                sizes: {
                    width: 500,
                    height: 500
                },
                food: {
                    energy: 100,
                    countFood: 20,
                    velocityRegenerate: 0.3 //От 0 до 1. 1, если восстанавливается мгновенно
                },
                borderType: 'walls', //connected
            }

            options = deepParseOpt(defaultOpt, options);

            this.sizes = {
                width: options.sizes.width,
                height: options.sizes.height
            };
            this.borderType = options.borderType;

            this.zoom = 1;
            this.translate = createVector((width - this.sizes.width) / 2,
                (height - this.sizes.height) / 2);

            this.food = {
                grass: [],
                meat: [],
                countFood: options.food.countFood,
                velocityRegenerate: options.food.velocityRegenerate,
                energy: options.food.energy
            };
            this.cells = [];

            this.generateGrass(options.food.countFood, true);

            // Events
            global.canvas.addEventListener('mousedown', this.mouseDownHandler.bind(this));
            global.canvas.addEventListener('mousewheel', this.scrollHandler.bind(this));
	    window.addEventListener('wheel', this.scrollHandler.bind(this))		
            window.addEventListener('mouseup', this.mouseUpHandler.bind(this));
            window.addEventListener('mousemove', this.mouseMoveHandler.bind(this));
        }

        mouseDownHandler(e) {
            global.mouseEventObj.isMouseDown = true;
            global.mouseEventObj.lastLocation = createVector(e.clientX, e.clientY);
        }
        mouseUpHandler() {
            global.mouseEventObj.isMouseDown = false;
        }
        mouseMoveHandler(e) {
            if (!global.mouseEventObj.isMouseDown)
                return;


            this.translate = createVector(
                this.translate.x + e.clientX - global.mouseEventObj.lastLocation.x,
                this.translate.y + e.clientY - global.mouseEventObj.lastLocation.y
            );

            global.mouseEventObj.lastLocation = createVector(e.clientX, e.clientY);
        }
        scrollHandler(e) {
	    let delta = e.deltaY || e.detail || e.wheelDelta;
            let newZoom = this.zoom + delta / globalSettings.scrollCoef;
            let canvasPos = createVector(e.clientX, e.clientY).sub(e.target.offsetLeft, e.target.offsetTop);
            let diffZoom = newZoom / this.zoom;

            this.zoom += delta / globalSettings.scrollCoef;
        }

        generateGrass(count, first = false) {
            if (first) {
                for (let i = 0; i < count; ++i) {
                    this.food.grass.push(new global.Grass(random(this.sizes.width), random(this.sizes.height), this.food.energy));
                }
                return;
            }

            let regenerateCount = round((this.food.countFood - this.food.grass.length) * this.food.velocityRegenerate);
            if (this.food.countFood < this.food.grass.length + regenerateCount)
                regenerateCount = this.food.countFood - this.food.grass.length;
            for (let i = 0; i < regenerateCount; ++i) {
                this.food.grass.push(new global.Grass(random(this.sizes.width), random(this.sizes.height), this.food.energy));
            }
        }
        killCell(cell) {
            this.food.meat.push(...cell.die());
            this.cells = removeFromArr(this.cells, cell);
        }

        border(item) {
            function bound(normal, velocity) {
                return velocity.copy()
                               .rotate(normal.angleBetween(velocity) * 2)
                               .mult(-1);
            }

            if (this.borderType === 'walls') {
                if (item.location.y < item.radius) {
                    item.location.y = item.radius;
                    item.velocity = bound(createVector(0, 1), item.velocity);
                }
                if (item.location.x < item.radius) {
                    item.location.x = item.radius;
                    item.velocity = bound(createVector(1, 0), item.velocity);
                }
                if (item.location.x > this.sizes.width - item.radius) {
                    item.location.x = this.sizes.width - item.radius;
                    item.velocity = bound(createVector(-1, 0), item.velocity);
                }
                if (item.location.y > this.sizes.height - item.radius) {
                    item.location.y = this.sizes.height - item.radius;
                    item.velocity = bound(createVector(0, -1), item.velocity);
                }
            } else if (this.borderType === 'connected') {
                if (item.location.x < 0) item.location.x = this.sizes.width;
                if (item.location.y < 0) item.location.y = this.sizes.height;
                if (item.location.x > this.sizes.width) item.location.x = 0;
                if (item.location.y > this.sizes.height) item.location.y = 0;
            }
        }

        displayBackground() {
            noStroke();
            fill(globalSettings.worldStyle.bgColor);
            translate(this.translate.x, this.translate.y);
            scale(this.zoom);
            rect(0, 0,
                this.sizes.width,
                this.sizes.height);
        }
        displayFood() {
            [...this.food.grass, ...this.food.meat].forEach(item => {
                item.update();
                this.border(item);
                item.draw();
            });

        }
        displayCells() {
            this.cells.forEach(item => {
                item.update();
                item.updateVisibleObjects({
                        grass: global.World.getObjectsAround(this.food.grass, item),
                        meat: global.World.getObjectsAround(this.food.meat, item)
                    },
                    global.World.getObjectsAround(this.cells, item)
                );
                if (item.energy <= globalSettings.cellBehaviour.deathEnergy * item.maxEnergy) {
                    this.food.meat.push(...item.die());
                    this.cells = removeFromArr(this.cells, item);
                    return;
                }

                this.border(item);
                item.display();
            });
        }

        addCell(cell) {
            this.cells.push(cell);
        }

        checkFeeding() {
            this.cells.forEach(item => {
                this.checkCellsEating(item);
                this.checkFoodEating(item);
            });
        }
        checkFoodEating(cell) {
            [...this.food.grass, ...this.food.meat].forEach(food => {
                if (food.type !== cell.type)
                    return;

                let cellToFoodVector = p5.Vector.sub(cell.location, food.location);
                if (cellToFoodVector.mag() > cell.radius)
                    return;

                if (cell.energy + food.energy >= cell.maxEnergy)
                    return;


                cell.eat(food);
                this.food[food.type] = removeFromArr(this.food[food.type], food);

            });
        }
        checkCellsEating(cell) {
            if (cell.type !== 'meat')
                return;

            this.cells.forEach(item => {
                let cellToCellVector = p5.Vector.sub(cell.location, item.location);
                if (cellToCellVector.mag() > item.radius) //cell.radius +
                    return;

                if (cell == item)
                    return;

                if (global.World.proportional(cell.radius, item.radius) <= globalSettings.cellBehaviour.diffSizeCellsPassing)
                    return;

                if (cell.radius < item.radius)
                    return;

                if (item.energy + cell.energy  > cell.maxEnergy) {
                    this.killCell(item);
                } else {
                    cell.eat(new global.Meat(cell.location.x, cell.location.y,
                        item.energy
                    ));
                    this.cells = removeFromArr(this.cells, item);
                }
            });
        }

        draw() {
            this.displayBackground();
            this.displayFood();
            this.displayCells();
            this.checkFeeding();
            this.generateGrass();
        }

        static getObjectsAround(arr, cell) {
            let objectsAround = [];
            arr.forEach(item => {
                if (p5.Vector.sub(cell.location, item.location).mag() - item.radius <= cell.visorRadius) {
                    objectsAround.push(item);
                }
            });
            return objectsAround;
        }

        static proportional(item1, item2) {
            let minItem = min(item1, item2),
                maxItem = max(item1, item2);

            return 1 - minItem / maxItem;
        }

    }

    const worldOptions = {
        food: {
            countFood: 20,
            energy: 200,
            velocityRegenerate: 0.8,
        },
        sizes: {
            width: 2000,
            height: 2000
        }
    };
    world = new global.World(worldOptions);

    statistic = new global.Statistic(world, 100);
    document.addEventListener('keydown', (e) => {
    	if ( e.keyCode === 67 ) {
    		statistic.copyToClipboard();
    	}
    });


    let radius = 25;
    let options = {
        radius: radius,
        maxEnergy: 2500,
        world: world,
        visorRadius: radius * 10,
        maxSteerForce: 100
    }
    for (let i = 0; i < 50; ++i) {
        world.addCell(new global.GrassEater(random(1000), random(1000), options));
    }
    for (let i = 0; i < 0; ++i) {
        world.killCell( world.cells[i] );
    }
    for (let i = 0; i < 8; ++i) {
        world.addCell( new global.MeatEater( random(500), random(500), Object.assign({}, options, {radius: radius * 1.5}) ) );
    }

    frameRate(240);

}


global.Statistic = class {
	constructor(world, period) {
		this.world  = world;
		this.period = period;

		this.counter = 0;

		this.data = [];

		this.container = document.createElement('div');
		this.container.style.position = 'relative';
		this.container.style.left = '-9999px';
		this.container.style.width = '0';
		document.body.appendChild(this.container);
	}

	update() {
		if ( ++this.counter === this.period ) {
			this.counter = 0;
			this.data.push({
				grass: this.world.cells.filter(cell => cell.type === 'grass').length,
				meat:  this.world.cells.filter(cell => cell.type === 'meat').length
			});	
		}
	}

	copyToClipboard() {
		let dataStr = '';
		this.data.forEach(item => {
			dataStr += '<div>' + item.grass + ' ' + item.meat + '</div>';
		})
		this.container.innerHTML = dataStr;

		if (document.selection) { 
			let range = document.body.createTextRange();
			range.moveToElementText( this.container );
			range.select().createTextRange();
			document.execCommand("Copy"); 
		} else if (window.getSelection) {
			let range = document.createRange();
			range.selectNode( this.container );
			window.getSelection().addRange(range);
			document.execCommand("Copy");
		}
	}
}


function draw() {
    background(globalSettings.worldStyle.borderColor);
    world.draw();
    statistic.update();
}

//Копирование св-тв одного объекта в другой
function deepParseOpt(sourseObj, donorObj, withEmptyObj = false) {
    let buildObj = {};

    for (let sourceKey in sourseObj) {
        if (withEmptyObj &&
            typeof donorObj[sourceKey] === 'object' &&
            typeof sourseObj[sourceKey] === 'object' &&
            Object.keys(sourseObj[sourceKey]).length == 0) {

            buildObj[sourceKey] = donorObj[sourceKey];
        } else if (typeof donorObj[sourceKey] === 'object' && typeof sourseObj[sourceKey] === 'object') {
            buildObj[sourceKey] = deepParseOpt(sourseObj[sourceKey], donorObj[sourceKey]);
        } else if (donorObj.hasOwnProperty(sourceKey)) {
            buildObj[sourceKey] = donorObj[sourceKey];
        } else {
            buildObj[sourceKey] = sourseObj[sourceKey];
        }
    }

    return buildObj;
}

function removeFromArr(arr, item) {
    let iRemovedItem = arr.indexOf(item);

    if (arr.indexOf(item) === -1)
        return false;

    return [...arr.slice(0, iRemovedItem), ...arr.slice(iRemovedItem + 1)];
}
