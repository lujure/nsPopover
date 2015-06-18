(function(window, angular, undefined){
  'use strict';

  var module = angular.module('nsPopover', []);
  var $el = angular.element;
  var isDef = angular.isDefined;
  var $popovers = [];
  var globalId = 0;

  module.provider('nsPopover', function () {
    var defaults = {
      template: '',
      theme: 'ns-popover-list-theme',
      plain: 'false',
      trigger: 'click',
      triggerPrevent: true,
      angularEvent: '',
      scopeEvent: '',
      container: 'body',
      placement: 'bottom|left',
      timeout: 1.5,
      hideOnInsideClick: false,
      hideOnOutsideClick: true,
      hideOnButtonClick: true,
      mouseRelative: '',
      popupDelay: 0,
      activeClass: '',
      mobileResponsive: true
    };

    this.setDefaults = function(newDefaults) {
      angular.extend(defaults, newDefaults);
    };

    this.$get = function () {
      return {
        getDefaults: function () {
          return defaults;
        }
      };
    };
  });

  module.directive('nsPopover', ['nsPopover','$rootScope','$timeout','$templateCache','$q','$http','$compile','$document','$parse',
    function(nsPopover, $rootScope, $timeout, $templateCache, $q, $http, $compile, $document, $parse) {
      return {
        restrict: 'A',
        scope: true,
        link: function(scope, elm, attrs) {
          var defaults = nsPopover.getDefaults();

          var options = {
            template: attrs.nsPopoverTemplate || defaults.template,
            theme: attrs.nsPopoverTheme || defaults.theme,
            plain: toBoolean(attrs.nsPopoverPlain || defaults.plain),
            trigger: attrs.nsPopoverTrigger || defaults.trigger,
            triggerPrevent: attrs.nsPopoverTriggerPrevent || defaults.triggerPrevent,
            angularEvent: attrs.nsPopoverAngularEvent || defaults.angularEvent,
            scopeEvent: attrs.nsPopoverScopeEvent || defaults.scopeEvent,
            container: attrs.nsPopoverContainer || defaults.container,
            placement: attrs.nsPopoverPlacement || defaults.placement,
            timeout: attrs.nsPopoverTimeout || defaults.timeout,
            hideOnInsideClick: toBoolean(attrs.nsPopoverHideOnInsideClick || defaults.hideOnInsideClick),
            hideOnOutsideClick: toBoolean(attrs.nsPopoverHideOnOutsideClick || defaults.hideOnOutsideClick),
            hideOnButtonClick: toBoolean(attrs.nsPopoverHideOnButtonClick || defaults.hideOnButtonClick),
            mouseRelative: attrs.nsPopoverMouseRelative,
            popupDelay: attrs.nsPopoverPopupDelay || defaults.popupDelay,
            group: attrs.nsPopoverGroup,
            activeClass: attrs.nsPopoverActiveClass || defaults.activeClass,
            mobileResponsive: attrs.nsPopoverMobileResponsive || defaults.mobileResponsive
          };

          if (options.mouseRelative) {
            options.mouseRelativeX = options.mouseRelative.indexOf('x') !== -1;
            options.mouseRelativeY = options.mouseRelative.indexOf('y') !== -1;
          }

          var displayer_ = {
            id_: undefined,

            /**
             * Set the display property of the popover to 'block' after |delay| milliseconds.
             *
             * @param delay {Number}  The time (in seconds) to wait before set the display property.
             * @param e {Event}  The event which caused the popover to be shown.
             */
            display: function(delay, e) {
              // Disable popover if ns-popover value is false
              if ($parse(attrs.nsPopover)(scope) === false) {
                return;
              }

              $timeout.cancel(displayer_.id_);

              if (!isDef(delay)) {
                delay = 0;
              }

              // hide any popovers being displayed
              if (options.group) {
                $rootScope.$broadcast('ns:popover:hide', options.group);
              }

              displayer_.id_ = $timeout(function() {
                $popover.isOpen = true;
                if(options.activeClass) {
                    elm.addClass(options.activeClass);
                }
                $popover.css('display', 'block');

                // position the popover accordingly to the defined placement around the
                // |elm|.
                var elmRect = getBoundingClientRect(elm[0]);

                // If the mouse-relative options is specified we need to adjust the
                // element client rect to the current mouse coordinates.
                if (options.mouseRelative) {
                  elmRect = adjustRect(elmRect, options.mouseRelativeX, options.mouseRelativeY, e);
                }

                move($popover, placement_, align_, elmRect, $triangle);

                if (options.hideOnInsideClick || mobileCheck()) {
                  // Hide the popover without delay on the popover click events.
                  $popover.on('click', insideClickHandler);
                }
                if (options.hideOnOutsideClick) {
                  // Hide the popover without delay on outside click events.
                  $document.on('click', outsideClickHandler);
                }
                if (options.hideOnButtonClick) {
                  // Hide the popover without delay on the button click events.
                  elm.on('click', buttonClickHandler);
                }
              }, delay*1000);
            },

            cancel: function() {
              $timeout.cancel(displayer_.id_);
            }
          };

          var hider_ = {
            id_: undefined,

            /**
             * Set the display property of the popover to 'none' after |delay| milliseconds.
             *
             * @param delay {Number}  The time (in seconds) to wait before set the display property.
             */
            hide: function(delay) {
              $timeout.cancel(hider_.id_);

              // delay the hiding operation for 1.5s by default.
              if (!isDef(delay)) {
                delay = 1.5;
              }

              hider_.id_ = $timeout(function() {
                $popover.off('click', insideClickHandler);
                $document.off('click', outsideClickHandler);
                elm.off('click', buttonClickHandler);
                $popover.isOpen = false;
                displayer_.cancel();
                $popover.css('display', 'none');
                if(options.activeClass) {
                  elm.removeClass(options.activeClass);
                }
              }, delay*1000);
            },

            cancel: function() {
              $timeout.cancel(hider_.id_);
            }
          };

          var $container = $document.find(options.container);
          if (!$container.length) {
            $container = $document.find('body');
          }

          var $triangle;
          var placement_;
          var align_;

          globalId += 1;

          var $popover = $el('<div id="nspopover-' + globalId +'"></div>');
          $popovers.push($popover);

          var match = options.placement
            .match(/^(top|bottom|left|right)$|((top|bottom)\|(center|left|right)+)|((left|right)\|(center|top|bottom)+)/);

          if (!match) {
            throw new Error('"' + options.placement + '" is not a valid placement or has a invalid combination of placements.');
          }

          placement_ = match[6] || match[3] || match[1];
          align_ = match[7] || match[4] || match[2] || 'center';

          $q.when(loadTemplate(options.template, options.plain)).then(function(template) {
            template = angular.isString(template) ?
              template :
              template.data && angular.isString(template.data) ?
                template.data :
                '';

            $popover.html(template);

            if (options.theme) {
              $popover.addClass(options.theme);
            }

            if(mobileCheck()) {
              $popover.addClass('ns-popover-mobile-ribbon');
            } else {
              // Add classes that identifies the placement and alignment of the popver
              // which allows the customization of the popover based on its position.
              $popover
                .addClass('ns-popover-' + placement_ + '-placement')
                .addClass('ns-popover-' + align_ + '-align');
            }

            $compile($popover)(scope);

            scope.$on('$destroy', function() {
              $popover.remove();
            });

            scope.hidePopover = function() {
              hider_.hide(0);
            };

            scope.$on('ns:popover:hide', function(ev, group) {
              if (options.group === group) {
                  scope.hidePopover();
              }
            });

            $popover
              .css('position', 'absolute')
              .css('display', 'none');

            //search for the triangle element - works in ie8+
            $triangle = $popover[0].querySelectorAll('.triangle');
            //if the element is found, then convert it to an angular element
            if($triangle.length){
              $triangle = $el($triangle);
            }

            $container.append($popover);
          });

          if (options.angularEvent) {
            $rootScope.$on(options.angularEvent, function() {
              hider_.cancel();
              displayer_.display(options.popupDelay);
            });
          } else if (options.scopeEvent) {
            scope.$on(options.scopeEvent, function() {
              hider_.cancel();
              displayer_.display($popover, options.popupDelay);
            });
          } else {
            elm.on(options.trigger, function(e) {
              if (false !== options.triggerPrevent) {
                e.preventDefault();
              }
              hider_.cancel();
              displayer_.display(options.popupDelay, e);
            });
          }

          elm
            .on('mouseout', function() {
              hider_.hide(options.timeout);
            })
            .on('mouseover', function() {
              hider_.cancel();
            });

          $popover
            .on('mouseout', function(e) {
              hider_.hide(options.timeout);
            })
            .on('mouseover', function() {
              hider_.cancel();
            });

          /**
           * Move the popover to the |placement| position of the object located on the |rect|.
           *
           * @param popover {Object} The popover object to be moved.
           * @param placement {String} The relative position to move the popover - top | bottom | left | right.
           * @param align {String} The way the popover should be aligned - center | left | right.
           * @param rect {ClientRect} The ClientRect of the object to move the popover around.
           * @param triangle {Object} The element that contains the popover's triangle. This can be null.
           */
          function move(popover, placement, align, rect, triangle) {
            var popoverRect = getBoundingClientRect(popover[0]);
            var top, left;

            var positionX = function() {
              if (align === 'center') {
                return Math.round(rect.left + rect.width/2 - popoverRect.width/2);
              } else if(align === 'right') {
                return rect.right - popoverRect.width;
              }
              return rect.left;
            };

            var positionY = function() {
              if (align === 'center') {
                return Math.round(rect.top + rect.height/2 - popoverRect.height/2);
              } else if(align === 'bottom') {
                return rect.bottom - popoverRect.height;
              }
              return rect.top;
            };

            if (placement === 'top') {
              top = rect.top - popoverRect.height;
              left = positionX();
            } else if (placement === 'right') {
              top = positionY();
              left = rect.right;
            } else if (placement === 'bottom') {
              top = rect.bottom;
              left = positionX();
            } else if (placement === 'left') {
              top = positionY();
              left = rect.left - popoverRect.width;
            }

            popover
              .css('top', top.toString() + 'px');

            if(!mobileCheck()) {
              popover.css('left', left.toString() + 'px');
            }

            if (triangle && triangle.length) {
              if (placement === 'top' || placement === 'bottom') {
                left = rect.left + rect.width / 2 - left;
                triangle.css('left', left.toString() + 'px');
              } else {
                top = rect.top + rect.height / 2 - top;
                triangle.css('top', top.toString()  + 'px');
              }
            }
          }

          /**
           * Adjust a rect accordingly to the given x and y mouse positions.
           *
           * @param rect {ClientRect} The rect to be adjusted.
           */
          function adjustRect(rect, adjustX, adjustY, ev) {
            // if pageX or pageY is defined we need to lock the popover to the given
            // x and y position.
            // clone the rect, so we can manipulate its properties.
            var localRect = {
              bottom: rect.bottom,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width
            };

            if (adjustX) {
              localRect.left = ev.pageX;
              localRect.right = ev.pageX;
              localRect.width = 0;
            }

            if (adjustY) {
              localRect.top = ev.pageY;
              localRect.bottom = ev.pageY;
              localRect.height = 0;
            }

            return localRect;
          }

          /**
           * @link {http://stackoverflow.com/questions/11381673/detecting-a-mobile-browser}
           * @returns {boolean}
           */
          function mobileCheck() {
            if (!options.mobileResponsive) return false;
            var check = false;
            (function (a) {
              if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4)))check = true
            })(navigator.userAgent || navigator.vendor || window.opera);
            return check;
          }

          function getBoundingClientRect(elm) {
            var w = window;
            var doc = document.documentElement || document.body.parentNode || document.body;
            var x = (isDef(w.pageXOffset)) ? w.pageXOffset : doc.scrollLeft;
            var y = (isDef(w.pageYOffset)) ? w.pageYOffset : doc.scrollTop;
            var rect = elm.getBoundingClientRect();

            // ClientRect class is immutable, so we need to return a modified copy
            // of it when the window has been scrolled.
            if (x || y) {
              return {
                bottom:rect.bottom+y,
                left:rect.left + x,
                right:rect.right + x,
                top:rect.top + y,
                height:rect.height,
                width:rect.width
              };
            }
            return rect;
          }

          function toBoolean(value) {
            if (value && value.length !== 0) {
              var v = ("" + value).toLowerCase();
              value = (v == 'true');
            } else {
              value = false;
            }
            return value;
          }

          /**
           * Load the given template in the cache if it is not already loaded.
           *
           * @param template The URI of the template to be loaded.
           * @returns {String} A promise that the template will be loaded.
           * @remarks If the template is null or undefined a empty string will be returned.
           */
          function loadTemplate(template, plain) {
            if (!template) {
              return '';
            }

            if (angular.isString(template) && plain) {
              return template;
            }

            return $templateCache.get(template) || $http.get(template, { cache : true });
          }

          function insideClickHandler() {
            if ($popover.isOpen) {
              hider_.hide(0);
            }
          }

          function outsideClickHandler(e) {
            if ($popover.isOpen && e.target !== elm[0]) {
              var id = $popover[0].id;
              if (!isInPopover(e.target)) {
                hider_.hide(0);
              }
            }

            function isInPopover(el) {
              if (el.id === id) {
                return true;
              }

              var parent = angular.element(el).parent()[0];

              if (!parent) {
                return false;
              }

              if (parent.id === id) {
                return true;
              }
              else {
                return isInPopover(parent);
              }
            }
          }

          function buttonClickHandler() {
            if ($popover.isOpen) {
              hider_.hide(0);
            }
          }
        }
      };
    }
  ]);
})(window, window.angular);