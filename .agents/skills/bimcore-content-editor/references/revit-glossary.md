# Словарь терминов Revit (RU / EN / ES)

Канон правил статей (решение владельца 2026-10-02). Источник до переноса — база, `it/web/learn/data/revit-glossary.md`; теперь единственный источник — этот файл.

Проверенные соответствия названий интерфейса Revit для статей на трёх языках. Источник — справка Autodesk (RU/EN/ES). Файл только пополняется: новый термин дописывать сразу, со ссылкой на справку. Как пользоваться терминами — [quality-standard.md](quality-standard.md), «Термины Revit».

## Принцип

- Не выдумывать синонимы и не «улучшать» термины: держаться реальной локализации Revit и формулировок автора.
- Названия интерфейса в статье — жирным без кавычек. Имена видов и файлов, созданные пользователем, — не интерфейс: в «кавычках», без жирного.
- «—» в колонке ES означает, что испанский вариант не проверялся; перед использованием найти его в справке Autodesk ES и дописать сюда.

## Основные соответствия

| RU | EN | ES |
|----|----|----|
| Соединить (Геометрия) | Join Geometry | Unir geometría |
| Изменить тип | Edit Type | Editar tipo |
| Штриховка при низкой детализации | Coarse Scale Fill Pattern | Patrón de relleno de escala gruesa |
| Цвет штриховки при низкой детализации | Coarse Scale Fill Color | Color de relleno de escala gruesa |
| Сплошная заливка | Solid fill | Relleno sólido |
| Уровень детализации: Низкий / Средний / Высокий | Detail Level: Coarse / Medium / Fine | Nivel de detalle: Bajo / Medio / Alto |
| Переопределения видимости/графики (VG/VV) | Visibility/Graphic Overrides | Modificaciones de visibilidad/gráficos (см. поправку ниже) |
| Стены | Walls | Muros |
| Секущий диапазон | View Range | Rango de vista |
| Верх (секущего диапазона) | Top (of View Range) | Plano superior (del rango de vista) |
| Подложка | Underlay | Subyacente |
| Ориентация подложки | Underlay Orientation | Orientación de subyacente |
| Посмотреть вверх / Посмотреть вниз | Look Up / Look Down | Mirar hacia arriba / Mirar hacia abajo |
| Диапазон: нижний уровень | Range: Base Level | Rango: nivel base |
| Диапазон: верхний уровень | Range: Top Level | Rango: nivel superior |
| Не ограничено | Unbounded | Sin límite |
| Ограждение | Railing | Barandilla |
| Карниз | Cornice | Cornisa |
| План потолка (отражённый) | Reflected Ceiling Plan (RCP) | Plano de techo (reflejado) |
| Полутона | Halftone | Medios tonos |

### Заметки по смыслу (частые ошибки)

- Подложка показывает элементы **полутонами** (приглушённо), а не «без полутонов». Корректно: «линии полутонами, без заливки».
- Чтобы показать карниз из ограждения на плане потолка через секущий диапазон, **Верх** диапазона опускают НИЖЕ карниза (контринтуитивно, но верно).

## Пополнение 2026-07-25 (статьи блога про скорость работы)

Все строки сверены по локализованной справке Autodesk на нужном языке.

| RU | EN | ES |
|----|----|----|
| Создать аналог | Create Similar | Crear similar |
| Сопоставление свойств типа (страница справки называется «Соответствие по типу», кнопка — так) | Match Type Properties | Igualar propiedades de tipo |
| Выбрать все экземпляры | Select All Instances | Seleccionar todos los ejemplares |
| Видимые на виде / Во всём проекте | Visible in View / In Entire Project | Visibles en vista / En todo el proyecto |
| Образцы линий | Line Patterns | Patrones de línea |
| Стили линий | Line Styles | Estilos de línea |
| Границы 3D-вида | Section Box | Caja de sección |
| Закрыть неактивные виды (до Revit 2019 «Закрыть скрытые») | Close Inactive Views | Cerrar vistas inactivas |
| Ключевая спецификация | Key Schedule | Tabla de planificación de claves |
| Ведомость/Спецификация | Schedule/Quantities | Tabla de planificación de cantidades |
| Цветовые схемы | Color Schemes | Esquemas de color |
| Граница помещения (параметр) | Room Bounding | Delimitación de habitación |
| Диспетчер связей | Manage Links | Gestionar vínculos |
| Связь САПР / Импорт САПР | Link CAD / Import CAD | Vincular CAD / Importar CAD |
| Модель в контексте | Model In-Place | Modelo in situ |
| Рабочие наборы | Worksets | Subproyectos |
| Горячие клавиши | Keyboard Shortcuts | Métodos abreviados de teclado |

**Пути по ленте (из справки):** «Создать аналог» — контекстное меню или вкладка **Изменение**, панель **Создание**. «Сопоставление свойств типа» — вкладка **Изменение**, панель **Буфер обмена**, сочетание MA. «Образцы линий» — **Управление**, панель **Параметры**, **Дополнительные параметры**. ES: `Igualar propiedades de tipo` — ficha **Modificar**, grupo **Portapapeles**; `Patrones de línea` — ficha **Gestionar**, grupo **Configuración**.

**Не подтверждено официальной локализацией, писать по-английски с пояснением:** Transfer Project Standards (перенос стандартов проекта), Draw visible elements only.

Источники: [Создать аналог](https://help.autodesk.com/cloudhelp/2022/RUS/Revit-Model/files/GUID-4460B588-3FF6-4AA5-9E35-2E452E7070BA.htm) · [Соответствие по типу](https://help.autodesk.com/cloudhelp/2026/RUS/Revit-Model/files/GUID-796061DB-5ED0-49FB-973D-2408CE54BF5D.htm) · [Igualar propiedades de tipo](https://help.autodesk.com/cloudhelp/2024/ESP/Revit-Model/files/GUID-796061DB-5ED0-49FB-973D-2408CE54BF5D.htm) · [Crear similar](https://help.autodesk.com/cloudhelp/2016/ESP/Revit-Model/files/GUID-4460B588-3FF6-4AA5-9E35-2E452E7070BA.htm) · [Выбрать все экземпляры](https://help.autodesk.com/cloudhelp/2025/RUS/Revit-GetStarted/files/GUID-AB47C2E6-80C4-4C13-ADF1-B77775DD41D5.htm) · [Образцы линий](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-Customize/files/GUID-64B641A1-8750-4F12-916D-C76F8DF25975.htm) · [Границы 3D-вида](https://help.autodesk.com/cloudhelp/2023/RUS/Revit-DocumentPresent/files/GUID-C9EA51CB-3214-4BD8-AD55-3BEB1CCD15B6.htm) · [Ключевая спецификация](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-DocumentPresent/files/GUID-75B3B9C4-6899-4DC9-8424-DFC901701B48.htm)

## Пополнение 2026-09-12 (статья блога про отображение семейства на плане)

Сверено по русской справке Autodesk; английские названия из EN-интерфейса. ES не проверялся.

| RU | EN | ES |
|----|----|----|
| Визуальный стиль | Visual Style | — |
| Каркас (визуальный стиль) | Wireframe | Estructura alámbrica |
| Невидимые линии (визуальный стиль; НЕ «Скрытая линия») | Hidden Line | — |
| Тонированный (визуальный стиль) | Shaded | — |
| Совместимые цвета (визуальный стиль) | Consistent Colors | — |
| Переопределить графику на виде (правая кнопка по элементу) | Override Graphics in View | — |
| Прозрачность (столбец в VG, ползунок 0–100 у элемента) | Transparency | — |
| Редактор семейств | Family Editor | Editor de familias |
| Символическая линия (вкладка Аннотации, панель Узел) | Symbolic Line | — |
| Область маскировки | Masking Region | — |
| Параметры видимости (диалог «Параметры видимости элемента семейства») | Visibility Settings | — |
| Параметры сохранения файла | File Save Options | — |
| Максимальное кол-во резервных копий | Maximum backups | — |

Источники: [Визуальные стили](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-DocumentPresent/files/GUID-12C2D6B0-71ED-490E-9CC6-AD3C635F092B.htm) · [Каркас](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-DocumentPresent/files/GUID-C4F70AAA-2F1C-428B-B5BD-EA2562039C42.htm) · [Невидимые линии](https://help.autodesk.com/cloudhelp/2023/RUS/Revit-DocumentPresent/files/GUID-7167BA27-838A-40EC-ADBA-452E5C241A11.htm) · [Тонированный](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-DocumentPresent/files/GUID-C6ED7056-5AD3-4066-9269-96A09D085A8B.htm) · [Прозрачность поверхности](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-DocumentPresent/files/GUID-3A6AE98B-18A8-4BB7-95FB-E3E54EB91140.htm) · [Инструменты редактора семейств](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-Customize/files/GUID-253B2300-35C2-4024-AB70-43E576CEA49C.htm) · [Параметры видимости](https://help.autodesk.com/cloudhelp/2024/RUS/Revit-Customize/files/GUID-749AEB1E-1B01-46BC-9790-3473BC769211.htm) · [Параметры сохранения файла](https://help.autodesk.com/cloudhelp/2022/RUS/Revit-GetStarted/files/GUID-9E552B34-7C91-4159-B810-4295B2854AA7.htm)

## Пополнение 2026-09-25 (инструкция «Светильники», ES-версия)

Сверено по испанской справке Autodesk; RU из русской версии инструкции, EN из английской.

| RU | EN | ES |
|----|----|----|
| Диспетчер проекта | Project Browser | Navegador de proyectos |
| Типоразмеры в семействе (диалог) | Family Types | Tipos de familia |
| Управление (вкладка) | Manage | Gestionar |
| Стили объектов | Object Styles | Estilos de objeto |
| Вырезать геометрию | Cut Geometry | Cortar geometría |
| Осветительные приборы (категория) | Lighting Fixtures | Luminarias (см. поправку ниже) |
| Объекты аннотаций / Типовые аннотации | Annotation Objects / Generic Annotations | Objetos de anotación / Anotaciones genéricas (по интерфейсу ES; страница справки не открылась, при сомнении проверить в окне Revit) |
| Заменить существующую версию и значения параметров (вариант при повторной загрузке семейства) | Overwrite the existing version and its parameter values | Sobrescribir la versión existente y sus valores de parámetros |

**Поправки 2026-09-25 (сверено по справке Autodesk ES):**
- Lighting Fixtures по-испански — **Luminarias** (только у этой категории есть параметр «Origen de luz»); прежний вариант «Aparatos de iluminación» неверен. «Dispositivos de iluminación» — это Lighting Devices.
- Диалог Visibility/Graphic Overrides по-испански — **Modificaciones de visibilidad/gráficos** ([справка](https://help.autodesk.com/cloudhelp/2024/ESP/Revit-DocumentPresent/files/GUID-C8976D73-6590-4D65-9B41-626F48F4D9BB.htm)); прежний вариант «Reemplazos de visibilidad/gráficos» справкой не подтверждается.
- Вариант повторной загрузки семейства — [справка](https://help.autodesk.com/cloudhelp/2024/ESP/Revit-Model/files/GUID-25A9F912-180A-4632-8DBD-52D90BF65047.htm).

Источники: [Gestionar familias y tipos de familia](https://help.autodesk.com/cloudhelp/2019/ESP/Revit-Model/files/GUID-AFD96736-F47C-4B62-A568-68961067C878.htm) · [Herramientas del Editor de familias](https://help.autodesk.com/view/RVT/2024/ESP/?guid=GUID-253B2300-35C2-4024-AB70-43E576CEA49C) · [Estilos de objeto](https://help.autodesk.com/cloudhelp/2024/ESP/Revit-Customize/files/GUID-01DE5723-A5DD-41FE-B7C7-3C9B37B5C8C2.htm) · [Cortar geometría](https://help.autodesk.com/cloudhelp/2020/ESP/Revit-Model/files/GUID-7C940A08-1F62-465F-89BF-3800E3446FC3.htm) · [Estilos visuales](https://help.autodesk.com/cloudhelp/2024/ESP/Revit-DocumentPresent/files/GUID-12C2D6B0-71ED-490E-9CC6-AD3C635F092B.htm) · [Acerca de las categorías de familias de MEP](https://knowledge.autodesk.com/es/support/revit-products/learn-explore/caas/CloudHelp/cloudhelp/2018/ESP/Revit-Customize/files/GUID-48B14613-5BFC-4E4D-B1DF-80B85EC8DFF3-htm.html)
