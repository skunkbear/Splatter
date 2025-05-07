import {Socket} from "./lib/socket.js";

export class BloodSplatter {
  constructor() {
    this.containerManager = new BloodSplatterContainerManager();
    this.decalMaterials = {};
    this.Update();
    canvas.primary.BloodSplatter = this;
  }

  Splat(scale, color, alpha) {
    this.Cleanup();
    let scaleRandom = 0.8 + Math.random() * 0.4;
    let cachedTex =
      PIXI.utils.TextureCache[
        `modules/splatter/bloodsplats/blood${Math.floor(
          Math.random() * 26
        )}.svg`
      ];
    let sprite = cachedTex
      ? PIXI.Sprite.from(cachedTex)
      : PIXI.Sprite.from(
          `modules/splatter/bloodsplats/blood${Math.floor(
            Math.random() * 26
          )}.svg`
        );
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(
      scale * this.scaleMulti * scaleRandom,
      scale * this.scaleMulti * scaleRandom
    );
    sprite.alpha = alpha ?? this.alpha;
    sprite.tint = color || this.color;
    sprite.rotation = Math.random() * Math.PI * 2;
    return sprite;
  }

  SplatFromToken(token, { extraScale = 1, isTrail = false } = {}) {
    const colorFlag = token.document.flags.splatter?.bloodColor;
    let colorData = {};
    if (!colorFlag && this.bloodSheet) {
      const creatureType = this.creatureType(token);
      let bloodSheetColor;
      if (Array.isArray(creatureType)) {
        creatureType.forEach((type) => {
          if (this.bloodSheetData[type]) {
            bloodSheetColor = this.bloodSheetData[type];
          }
        });
      } else {
        bloodSheetColor = this.bloodSheetData[creatureType];
        if (!bloodSheetColor) {
          const matchingKey = Object.keys(this.bloodSheetData).find((key) => creatureType.includes(key));
          if (matchingKey) {
            bloodSheetColor = this.bloodSheetData[matchingKey];
          }
        }
      }
      colorData = this.ColorStringToHexAlpha(bloodSheetColor);
    }
    if (colorFlag) {
      colorData = this.ColorStringToHexAlpha(colorFlag);
    }
    const splatScale =
      ((Math.abs(token.document.texture.scaleX) + Math.abs(token.document.texture.scaleY))/2) *
      Math.max(token.document.width, token.document.height) *
      extraScale;
    const violence = isTrail ? 1 : this.violence;
    if(!isTrail && game.Levels3DPreview?._active){
      return this.splat3D(splatScale, colorData?.color, colorData?.alpha,token, violence);
    }
    let splatContainer = new PIXI.Container();
    splatContainer.x = token.center.x;
    splatContainer.y = token.center.y;
    for (let i = 0; i < violence; i++) {
      splatContainer.addChild(
        this.Splat(splatScale, colorData?.color, colorData?.alpha)
      );
    }
    if (this.wallsBlock) {
      const maxDimension = Math.max(
        splatContainer.width,
        splatContainer.height
      );
      const radius = maxDimension > 10 ? maxDimension : 1000;
      const tokenMaxDim = Math.max(token.document.width, token.document.height);
      if (radius >= tokenMaxDim) {
        let mask = BloodSplatter.getMask(token.center, radius);
        splatContainer.addChild(mask);
        splatContainer.mask = mask;
      }
    }
    this.containerManager.getContainer(token.document?.elevation).addChild(splatContainer);
  }

  splat3D(scale, color, alpha,token, count){
    color = color ?? this.color;
    alpha = alpha ?? this.alpha;
    color = color.replace("0x", "#");
    const token3d = game.Levels3DPreview.tokens[token.id];
    if(token3d) token3d.animationHandler.playAnimation("shake");
    const THREE = game.Levels3DPreview.THREE;
    const DecalGeometry = game.Levels3DPreview.CONFIG.THREEUTILS.DecalGeometry;
    const position = token3d.head;
    let targetp = position.clone();
    targetp.y -= 999999;
    if (token3d.lastParticleOrigin) {
      const currentRayDirection = targetp.clone().sub(position).normalize();
      const lastRayDirection = token3d.lastParticleOrigin.clone().sub(position).normalize();
      const averageDirection = currentRayDirection.sub(lastRayDirection.clone().normalize()).normalize();
      //const averageDirection = position.clone().sub(token3d.lastParticleOrigin).normalize();
      targetp = position.clone().add(averageDirection.multiplyScalar(999999));
    }
    const intersects = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(position,targetp, "collision", false, false, false, true)
    if(!intersects[0]) return;
    const intersect = intersects[0];
    const rotation = new THREE.Matrix4();
    rotation.lookAt(position, intersect.point, new THREE.Vector3(0,1,0));

    scale *= 1.1 * canvas.grid.size / game.Levels3DPreview.factor;
    const euler = new THREE.Euler().setFromRotationMatrix(rotation);
    const geometry =  new DecalGeometry( intersect.object, intersect.point, euler, new THREE.Vector3(scale,scale,scale) );
    for(let i = 0; i < count; i++){
      const sprite = `modules/splatter/bloodsplats/blood${Math.floor(Math.random() * 26)}.svg`;
      let material;
      if(this.decalMaterials[`${sprite}|${color}`]){
        material = this.decalMaterials[`${sprite}|${color}`];
      }else{
        material = new THREE.MeshStandardMaterial({
          map: new THREE.TextureLoader().load(sprite),
          alphaTest: 0.5,
          color: new THREE.Color(color),
          polygonOffset: true,
          polygonOffsetFactor: -1,
          roughness: 1,
          metalness: 0,
        });
        this.decalMaterials[`${sprite}|${color}`] = material;
      }
      const mesh = new THREE.Mesh( geometry, material );
      mesh.reciveShadow = true;
      mesh.name = "splatter";
      game.Levels3DPreview.scene.add( mesh );
    }
  }


  Destroy() {
    this.containerManager.destroyAll();
    canvas.primary.BloodSplatter = null;
  }

  Update() {
    const colorData = this.ColorStringToHexAlpha(
      game.settings.get("splatter", "bloodColor")
    );
    this.color = colorData?.color;
    this.alpha = colorData?.alpha;
    this.bloodSheet = game.settings.get("splatter", "useBloodsheet");
    this.bloodSheetData = game.settings.get("splatter", "BloodSheetData");
    this.violence = game.settings.get("splatter", "violence");
    this.scaleMulti = game.settings.get("splatter", "bloodsplatterScale");
    this.wallsBlock = game.settings.get("splatter", "wallsBlockBlood");
    this.inCombat = game.settings.get("splatter", "onlyInCombat");
    this.cleanup = game.settings.get("splatter", "cleanup");
    this.bloodTrail = game.settings.get("splatter", "enableBloodTrail");
    this.scaleMulti =
      (canvas.dimensions.size / 100) *
      game.settings.get("splatter", "bloodsplatterScale");
  }

  Cleanup() {
    if (!this.cleanup) return;

    const allSplats = this.containerManager.getAllSplats();

    if (allSplats.length < (12 - this.cleanup) * 10) return;

    for (const splat of allSplats) {
      if (!splat.cleaningUP) {
        splat.cleaningUP = true;
        this.fadeOut(splat);
        return;
      }
    }
  }

  fadeOut(container) {
    let _blood = container.parent;
    let _this = container;
    function Animate() {
      if (_this._destroyed) {
        canvas.app.ticker.remove(Animate);
      } else {
        _this.alpha -= 0.01;
        if (_this.alpha <= 0) {
          _blood.removeChild(_this);
          _this.destroy();
          canvas.app.ticker.remove(Animate);
        }
      }
    }
    canvas.app.ticker.add(Animate);
  }

  ColorStringToHexAlpha(colorString) {
    if (!colorString) return undefined;
    const color = "0x" + colorString.slice(1, 7);
    const alpha = parseInt(colorString.slice(7), 16) / 255;
    return { color: color, alpha: alpha };
  }

  creatureType(token) {
    return (
      BloodSplatter.getCreatureTypeCustom(token.actor) ||
      BloodSplatter.getCreatureType(token.actor)
    );
  }

  static getMask(origin, radius){
    const fov = CONFIG.Canvas.polygonBackends.move.create(origin, {
      type: "move",
      density: 12,
    }).points;
    let g = new PIXI.Graphics();
    g.beginFill(0xffffff);
    g.drawPolygon(fov);
    g.endFill();
    g.x -= origin.x;
    g.y -= origin.y;
    g.isMask = true;
    return g;
  }

  static bloodTrailTicker(){
    if(!canvas.primary?.BloodSplatter?.bloodTrail) return;
    for ( const [animationName, animation] of Object.entries(CanvasAnimation.animations) ) {
      if ( !( animation.context instanceof Token) ) continue;
      BloodSplatter.bloodTrail.bind(animation.context)();    
    }
  }

  static bloodTrailOnTickWrapper(wrapped, ...args){
    args[1] = args[1] ?? {};
    const _this = this;
        function SplatterWrap(ontick) {
          return (...args) => {
            BloodSplatter.bloodTrail(...args).bind(_this);
            return ontick(...args);
          };
        }
        args[1].ontick = args[1].ontick ? SplatterWrap(args[1].ontick) : BloodSplatter.bloodTrail.bind(_this);

        return wrapped(...args);
  }

  static bloodTrail() {
    if (
      this.actor &&
      !this.bleeding &&
      (!canvas.primary.BloodSplatter?.inCombat ||
        (canvas.primary.BloodSplatter?.inCombat && game.combat?.started))
    ) {
      this.bleeding = true;
      const timeout = canvas.primary.BloodSplatter?.violence
        ? 300 - canvas.primary.BloodSplatter?.violence * 20
        : 100;
      setTimeout(() => {
        if (BloodSplatter.belowTreshold(this.actor)) {
          if (canvas.primary.BloodSplatter) {
            canvas.primary.BloodSplatter.SplatFromToken(this, {
              extraScale: Math.random() * 0.5,
              isTrail: true,
            });
          } else {
            new BloodSplatter();
            canvas.primary.BloodSplatter.SplatFromToken(this, {
              extraScale: Math.random() * 0.5,
              isTrail: true,
            });
          }
        }
        this.bleeding = false;
      }, timeout);
    }
  }

  static socketSplatFn({uuids}) {
    if (!game.settings.get("splatter", "enableBloodsplatter")) return;
    for (let uuid of uuids) {
      let token = fromUuidSync(uuid);
      token = token.object ?? token;
      if (!token) return;
      if (canvas.primary.BloodSplatter) {
        canvas.primary.BloodSplatter.SplatFromToken(token);
      } else {
        new BloodSplatter();
        canvas.primary.BloodSplatter.SplatFromToken(token);
      }
    }
  }

  static socketSplat(tokens) {
    let tokenIds = tokens.map((token) => token.id);
    Socket.Splat({tokenIds});
  }

  static clearAll() {
    if(game.Levels3DPreview?._active){
      game.Levels3DPreview.scene.children = game.Levels3DPreview.scene.children.filter(child => child.name !== "splatter");
    }
    if (canvas.primary.BloodSplatter) {
      canvas.primary.BloodSplatter.Destroy();
    }
  }

  static belowTreshold(actor) {
    if (!actor) return false;
    const hpMax = BloodSplatter.getHpMax(actor);
    const hpVal = BloodSplatter.getHpVal(actor);
    const useWounds = game.settings.get("splatter", "useWounds");
    const threshold = useWounds ? (100 * (hpMax - hpVal)) / hpMax : (100 * hpVal) / hpMax;
    if (
      threshold <=
      game.settings.get("splatter", "bloodsplatterThreshold")
    )
      return true;
    return false;
  }
  static getHpVal(actor) {
    return foundry.utils.getProperty(
      actor.system ?? actor,
      game.settings.get("splatter", "currentHp")
    );
  }
  static getHpMax(actor) {
    return foundry.utils.getProperty(actor.system ?? actor, game.settings.get("splatter", "maxHp"));
  }
  static getCreatureType(actorData) {
    return foundry.utils.getProperty(actorData.system, game.settings.get("splatter", "creatureType")) ?? actorData.type;
  }
  static getCreatureTypeCustom(actorData) {
    return foundry.utils.getProperty(
      actorData.system,
      game.settings.get("splatter", "creatureTypeCustom")
    );
  }
  static async saveBlood() {
    const bgElev = canvas.primary.background.elevation;
    for (const bloodContainer of canvas.primary.BloodSplatter.containerManager.containers) {
      let container = new PIXI.Container();
      let x = Infinity;
      let y = Infinity;
      for (let child of bloodContainer.children) {
        let cx = child.position.x - child.width / 2;
        let cy = child.position.y - child.height / 2;
        if (cx < x) x = cx;
        if (cy < y) y = cy;
      }
      container.addChild(bloodContainer);
      const b64 = await canvas.app.renderer.extract.base64(container, "image/png", 1);
      try {
        await FilePicker.createDirectory("data", "splatter");
      } catch (e) { }

      let res = await fetch(b64);
      let blob = await res.blob();
      const filename = `${canvas.scene.name}.${foundry.utils.randomID(20)}.png`;
      let file = new File([blob], filename, {type: "image/png"});
      const f = await FilePicker.upload("data", "splatter", file, {});

      await canvas.scene.createEmbeddedDocuments("Tile", [{
        texture: {
          src: f.path,
        },
        elevation: bloodContainer.elevation,
        flags: {
          levels: {
            rangeTop: bloodContainer.elevation,
          }
        },
        height: container.height,
        width: container.width,
        x: x,
        y: y,
        z: 1000,
      }]);
      
    }

    Socket.ClearAll();
  }


  static generateSplat(token, impactScale) {
    if (!canvas.primary.BloodSplatter) {
      new BloodSplatter();
      canvas.primary.BloodSplatter.SplatFromToken(token, {
        extraScale: impactScale,
      });
    } else {
      canvas.primary.BloodSplatter.SplatFromToken(token, {
        extraScale: impactScale,
      });
    }
  }
  static getImpactScale(actor, updates, diff){
    const useWounds = game.settings.get("splatter", "useWounds")
    return useWounds ? BloodSplatter.getImpactScaleWounds(actor, updates, diff) : BloodSplatter.getImpactScaleStandard(actor, updates, diff);
  }
  static getImpactScaleStandard(actor, updates, diff) {
    const hpMax = BloodSplatter.getHpMax(actor);
    const oldHpVal = diff.oldHpVal; //BloodSplatter.getHpVal(actor.data);
    const hpVal = BloodSplatter.getHpVal(updates);
    const impactScale = (oldHpVal - hpVal) / hpMax + 0.7;
    if (hpVal != undefined &&
      hpVal <= oldHpVal &&
      (100 * hpVal) / hpMax <=
      game.settings.get("splatter", "bloodsplatterThreshold")) {
      return impactScale;
    }else{
      return false;
    }
  }
  static getImpactScaleWounds(actor, updates, diff) {
    const hpMax = BloodSplatter.getHpMax(actor);
    const oldHpVal = diff.oldHpVal; //BloodSplatter.getHpVal(actor.data);
    const hpVal = BloodSplatter.getHpVal(updates);
    const impactScale = (hpVal - oldHpVal) / hpMax + 0.7;
    if (hpVal != undefined &&
      hpVal >= oldHpVal &&
      (100 * (hpMax - hpVal)) / hpMax <=
      game.settings.get("splatter", "bloodsplatterThreshold")) {
      return impactScale;
    }else{
      return false;
    }
  }
  static executeSplat(token, impactScale) {
    const delay = game.settings.get("splatter", "bloodsplatterDelay");
    setTimeout(function () {
      BloodSplatter.generateSplat(token, impactScale);
    }, delay);
  }
}

class BloodSplatterContainerManager{
  constructor () {
    this.defaultElevation = new TileDocument({width: 1, height: 1}).elevation;
    if (this.defaultElevation == -Infinity) this.defaultElevation = -1e10;
    this.sort = 1e100;
    this.containers = [];
  }
  
  getContainer(elevation) {
    if (isNaN(elevation)) elevation = this.defaultElevation;
    return this.containers.find(c => c.elevation == elevation) ?? this.createContainer(elevation);
  }

  createContainer(elevation) {
    const container = new PIXI.Container();
    canvas.primary.addChild(container);
    container.elevation = elevation;
    container.sort = this.sort;
    container.sortLayer = foundry.canvas.groups.PrimaryCanvasGroup.SORT_LAYERS.TILES + 1;
    this.containers.push(container);
    Object.defineProperty(container, "visible", {
      get: () => {
        return CONFIG?.Levels?.currentToken?.losHeight !== undefined ? CONFIG?.Levels?.currentToken?.losHeight >= elevation : true;
      }
    })
    return container;
  }

  getAllSplats() {
    const splats = [];
    for (const container of this.containers) {
      splats.push(...container.children)
    }
    return splats;
  }

  destroyAll() {
    for (const container of this.containers) {
      canvas.primary.removeChild(container);
      container.destroy({ children: true, texture: true });
    }
  }
  
}
