import {SharedElementTransition} from './sharedelement.transition';
import {compare} from 'stacking-order';
import {getBox, applyBox, parseOptions, wait} from './util';
import {FadeOutAnimation} from './animations/fade-out.animation';
import {FadeInAnimation} from './animations/fade-in.animation';
import {MoveDownAnimation} from './animations/move-down.animation';
import {MoveUpAnimation} from './animations/move-up.animation';
import {Injectable} from '@angular/core';
import {ExpandAnimation} from './animations/expand.animation';
import {ContractAnimation} from './animations/contract.animation';
import {LeaveDown} from './animations/leave-down';
import {EnterUp} from './animations/enter-up';

@Injectable({
  providedIn: 'root'
})
export class SharedElementTransitionManager {
  private oldComponent: any;
  private newComponent: any;

  public animations: any[] = [];
  public duration = 0;

  public timelineMode = false;
  public container: HTMLElement;

  animationRegistry: any = {};

  public transitions: SharedElementTransition[];

  constructor(outlet: any) {
    this.animationRegistry['fade-out'] = FadeOutAnimation;
    this.animationRegistry['fade-in'] = FadeInAnimation;
    this.animationRegistry['move-down'] = MoveDownAnimation;
    this.animationRegistry['move-up'] = MoveUpAnimation;
    this.animationRegistry['expand'] = ExpandAnimation;
    this.animationRegistry['contract'] = ContractAnimation;
    this.animationRegistry['leave-down'] = LeaveDown;
    this.animationRegistry['enter-up'] = EnterUp;

    /*
    outlet.activateEvents.subscribe((data: any) => {
      const activatedElement: any = outlet.activated.location.nativeElement; // activated is private!!!
      if (this.newComponent !== activatedElement) {
        if (this.newComponent) {
          this.oldComponent = this.newComponent;
        }
        this.newComponent = activatedElement;
        if (this.newComponent && this.oldComponent) {
          this.animationStarted();
        }
      }
    });
    */

    this.createContainer();
  }


  createContainer() {
    const container = document.createElement('div');

    container.style['contain'] = 'strict';
    container.style.perspective = '400px';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.right = '0';
    container.style.bottom = '0';
    container.style.pointerEvents = 'none';

    document.querySelector('body').append(container);
    this.container = container;
  }

  public animationStarted() {
    if (this.newComponent && this.oldComponent) {
      this.prepareTransition(this.newComponent, this.oldComponent);
    }
  }

  async prepareTransition(newView: any, oldView: any) {
    // We have to wait here one frame for the new view to be initialized.
    // The Problem is that the old view gets destroyed immediately so we create a copy here
    const oldViewClone = oldView.cloneNode(true);

    const box: any = getBox(oldView, {getMargins: false});
    applyBox(box, oldViewClone);

    newView.style.visibility = 'hidden';
    this.container.appendChild(oldViewClone);
    await wait(10);
    oldView = oldViewClone;
    newView.style.visibility = 'visible';

    const transformGroups: Array<any> = [];

    const convertToHeroItem = (x: any) => {
      const heroValue = x.getAttribute('morph-shared');
      const id = heroValue ? heroValue.split(';')[0] : null;
      const options = parseOptions(heroValue);
      return {
        node: x,
        id: id,
        heroValue: heroValue,
        options: options
      };
    };

    const filterActive = (x: any) => x.getAttribute('morph-shared-active') !== 'false';

    const toArray = (nodeList: any) => [].slice.call(nodeList);

    const queryHeros = (target: any) => toArray(target.querySelectorAll('*[morph-shared]'));

    const groupItems = (items, key) => {
      const result = items.reduce(function (r, a) {
        r[a[key]] = r[a[key]] || [];
        r[a[key]].push(a);
        return r;
      }, Object.create(null));
      return result;
    };

    const oldHeroItems: Array<any> = queryHeros(oldView)
      .filter(h => filterActive(h))
      .map((x: any) => convertToHeroItem(x));

    const newHeroItems: Array<any> = queryHeros(newView)
      .filter(h => filterActive(h))
      .map((x: any) => convertToHeroItem(x));

    const allItems: Array<any> = [...oldHeroItems, ...newHeroItems];

    const groups = groupItems(allItems, 'id');

    for (const i in groups) {
      if (groups[i].length === 2) {
        transformGroups.push({
          from: groups[i][0],
          to: groups[i][1]
        });
      }
    }

    transformGroups.sort((a, b) => {
      return compare(a.to.node, b.to.node);
    });

    this.transitions = transformGroups.map(group => {
      return new SharedElementTransition(group.from, group.to, this.container);
    });

    const queryLeave = (target: any) => toArray(target.querySelectorAll('*[morph-leave]'));
    const leaveItems: Array<any> = queryLeave(oldView)
      .filter(h => filterActive(h))
      .map((x: any) => convertToHeroItem(x));

    const staggerGroups = {};
    const leaveAnimations = leaveItems.map(item => {
      const heroValue = item.node.getAttribute('morph-leave');
      const animationType = heroValue.split(';')[0];
      const options = parseOptions(heroValue);
      if (options.hasOwnProperty('stagger')) {
        if (staggerGroups.hasOwnProperty(options.stagger)) {
          staggerGroups[options.stagger]++;
          options.delay = 50 * staggerGroups[options.stagger];
        } else {
          staggerGroups[options.stagger] = 0;
          options.delay = 50 * staggerGroups[options.stagger];
        }
      }
      return new this.animationRegistry[animationType](item.node, options, this.container);
    });

    const queryEnter = (target: any) => toArray(target.querySelectorAll('*[morph-enter]'));
    const enterItems: Array<any> = queryEnter(newView)
      .filter(h => filterActive(h))
      .map((x: any) => convertToHeroItem(x));

    const enterAnimations = enterItems.map(item => {
      const heroValue = item.node.getAttribute('morph-enter');
      const animationType = heroValue.split(';')[0];
      const options = parseOptions(heroValue);

      if (options.hasOwnProperty('stagger')) {
        if (staggerGroups.hasOwnProperty(options.stagger)) {
          staggerGroups[options.stagger]++;
          options.delay = 50 * staggerGroups[options.stagger];
        } else {
          staggerGroups[options.stagger] = 0;
          options.delay = 50 * staggerGroups[options.stagger];
        }
      }
      return new this.animationRegistry[animationType](item.node, options, this.container);
    });

    oldView.remove();

    if (this.timelineMode) {
      leaveAnimations.forEach((a: any) => {
        a.animations.map(x => x.pause());
      });

      enterAnimations.forEach((a: any) => {
        a.animations.map(x => x.pause());
      });

      this.transitions.forEach((a: any) => {
        a.animations.map(x => x.pause());
      });
    }

    this.animations = [...leaveAnimations, ...enterAnimations, ...this.transitions];

    let duration = 0;
    this.animations.forEach(ani => {
      duration = Math.max(duration, ani.options.delay + ani.options.duration);
    });

    this.duration = duration;
  }

  public setTime(val) {
    this.animations.forEach(a => {
      a.animations.forEach(an => (an.currentTime = val));
    });
  }

  public play() {
    this.animations.forEach(a => {
      a.animations.forEach(an => an.play());
    });
  }

  public pause() {
    this.transitions.forEach((s: SharedElementTransition) => {
      s.toAnimation.pause();
      s.fromAnimation.pause();
    });
  }

  public seek(val) {
    this.transitions.forEach((s: SharedElementTransition) => {
      s.toAnimation.currentTime = (val / 100) * 350;
      s.fromAnimation.currentTime = (val / 100) * 350;
    });
  }
}
