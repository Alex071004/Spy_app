# Фон Земли для F1

Локальные растровые фоны позволяют запускать первый макет без сетевых тайлов и Cesium ion. Это статические композиты, не live-данные и не новый оперативный слой.

| Файл               | Размер    | Происхождение       | Копия, использованная в макете                                                                                                           |
| ------------------ | --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `blue-marble.jpg`  | 4096×2048 | NASA Blue Marble    | [turban/webgl-earth, 2_no_clouds_4k.jpg](https://github.com/turban/webgl-earth/blob/master/images/2_no_clouds_4k.jpg)                    |
| `earth-lights.png` | 2048×1024 | NASA Earth at Night | [mrdoob/three.js, earth_lights_2048.png](https://github.com/mrdoob/three.js/blob/master/examples/textures/planets/earth_lights_2048.png) |

Оригинальные коллекции: [NASA Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble), [NASA Earth at Night](https://visibleearth.nasa.gov/collection/1483/earth-at-night). Изображения загружены 2026-11-09 без изменения пикселей. Дата съёмки в интерфейсе не заявляется.

Атрибуция NASA и Cesium остаётся видимой внизу экрана, в том числе на мобильном. Ночная текстура смешивается только с тёмной стороной глобуса. Параметры оформления берутся из `packages/ui/src/tokens.css`.
