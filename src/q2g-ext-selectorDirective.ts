﻿//#region imports
import { logging,
         utils,
         directives }           from "./node_modules/davinci.js/dist/umd/daVinci";
import * as template            from "text!./q2g-ext-selectorDirective.html";
//#endregion

//#region interfaces
interface IVMScope<T> extends ExtensionAPI.IExtensionScope {
    vm: T;
}

export interface IShortcutProperties {
    shortcutFocusDimensionList: string;
    shortcutFocusSearchField: string;
    shortcutFocusValueList: string;
    shortcutClearSelection: string;
}
//#endregion

//#region assist classes
class ListsInformation {
    maxNumberOfRows: number = 0;
    numberOfVisibleRows: number = 0;
}

class DataModel {
    dimensionList: Array<directives.IDataModelItem> = [];
    dimensionListBackup: Array<directives.IDataModelItem> = [];
    valueList: Array<directives.IDataModelItem> = [];
}
//#endregion

class SelectionsController implements ng.IController {

    $onInit(): void {
        this.logger.debug("initial Run of SelectionsController");
    }

    //#region Variables
    actionDelay: number = 0;
    dimensionList: utils.IQ2gListAdapter;
    editMode: boolean = false;
    element: JQuery;
    properties: IShortcutProperties = {
        shortcutFocusDimensionList: " ",
        shortcutFocusSearchField: " ",
        shortcutFocusValueList: " ",
        shortcutClearSelection: " ",
    };
    menuListDimension: Array<utils.IMenuElement>;
    menuListValues: Array<utils.IMenuElement>;
    selectedDimensioId: Array<string>;
    statusText: string;
    showFocusedDimension: boolean = false;
    showFocusedValue: boolean = false;
    showSearchFieldDimension: boolean = false;
    showSearchFieldValues: boolean = false;
    timeAriaIntervall: number = 0;
    timeout: ng.ITimeoutService;
    titleDimension: string = "Dimensions";
    titleValues: string = "no Dimension Selected";
    useReadebility: boolean = false;
    valueList: utils.IQ2gListAdapter;

    private engineGenericObjectVal: EngineAPI.IGenericObject;
    private selectedDimensionDefs: Array<string> = [];
    private selectedDimension: string = "";
    //#endregion

    //#region logger
    private _logger: logging.Logger;
    private get logger(): logging.Logger {
        if (!this._logger) {
            try {
                this._logger = new logging.Logger("SelectionsController");
            } catch (e) {
                console.error("ERROR in create logger instance", e);
            }
        }
        return this._logger;
    }
    //#endregion

    //#region lockMenuListValues
    private _lockMenuListValues: boolean = false;
    get lockMenuListValues() : boolean {
        return this._lockMenuListValues;
    }
    set lockMenuListValues(v : boolean) {
        if(v !== this._lockMenuListValues) {
            if (this._lockMenuListValues) {
                (this.engineGenericObjectVal.unlock as any)("/qListObjectDef")
                    .catch((e) => {
                        this.logger.error("Error in Setter of lockMenuListValues", e);
                    });
            }
            this._lockMenuListValues = v;
        }
    }
    //#endregion

    //#region inputAcceptValues
    private _inputAcceptValues: boolean = false;
    get inputAcceptValues (): boolean {
        return this._inputAcceptValues;
    }
    set inputAcceptValues (value: boolean) {
        if(this._inputAcceptValues !== value) {
            try {
                this.valueList.obj.acceptListObjectSearch(false)
                    .then(() => {
                        this._inputAcceptValues = false;
                        this.showSearchFieldValues = false;
                        this.textSearchValue = "";
                    }).catch((error) => {
                        this.logger.error("Error in setter of input Accept Dimension", error);
                    });
            } catch (error) {
                this.logger.error("Error in setter of input Accept", error);
                this._inputAcceptValues = false;
            }

            this._inputAcceptValues = value;
        }
    }
    //#endregion

    //#region inputCancelValues
    private _inputCancelValues: boolean = false;
    get inputCancelValues(): boolean {
        return this._inputCancelValues;
    }
    set inputCancelValues(value: boolean) {
        if(value!==this._inputCancelValues) {
            this._inputCancelValues = value;
        }
    }
    //#endregion

    //#region inputAcceptDimension
    private _inputAcceptDimensions: boolean = false;
    public get inputAcceptDimensions() : boolean {
        return this._inputAcceptDimensions;
    }
    public set inputAcceptDimensions(v : boolean) {
        if (v !== this._inputAcceptDimensions) {
            if(this.dimensionList.collection.length === 1) {
                this.createValueListSessionObjcet(this.dimensionList.collection[0].title, this.dimensionList.collection[0].defs);
                this.dimensionList.collection[0].status = "S";
                this.textSearchDimension = "";
                this.showSearchFieldDimension = false;
            }
            this._inputAcceptDimensions = v;
            this._inputAcceptDimensions = false;
        }
    }
    //#endregion

    //#region theme
    private _theme: string;
    get theme(): string {
        if (this._theme) {
            return this._theme;
        }
        return "default";
    }
    set theme(value: string) {
        if (value !== this._theme) {
            this._theme = value;
        }
    }
    //#endregion

    //#region model
    private _model: EngineAPI.IGenericObject;
    get model(): EngineAPI.IGenericObject {
        return this._model;
    }
    set model(value: EngineAPI.IGenericObject) {
        if (value !== this._model) {
			console.log("value", value);
            try {
                this._model = value;
                let that = this;
                value.on("changed", function () {
                    let properties: EngineAPI.IGenericHyperCubeProperties;


                    this.getProperties()
                        .then((res: EngineAPI.IGenericHyperCubeProperties) => {
                            properties = res;
                            return that.getProperties(res.properties);
                        })
                        .then(() => {
                            if (properties.qHyperCubeDef.qDimensions.length === 0) {
                                that.buildFieldList(this)
                                    .catch((error) => {
                                        Promise.reject(error);
                                    });
                            } else {
                                that.buildDimensionList(this)
                                    .catch((error) => {
                                        Promise.reject(error);
                                    });
                            }
                        })
                        .catch((error) => {
                            console.error("Error in on change of selector object", error);
                        });
                });
                this.model.emit("changed");
            } catch (e) {
                this.logger.error("error", e);
            }
        }
    }
    //#endregion

    //#region elementHeight
    private _elementHeight: number = 0;
    get elementHeight(): number {
        return this._elementHeight;
    }
    set elementHeight(value: number) {
        if (this.elementHeight !== value) {
            try {
                this._elementHeight = value;
            } catch (err) {
                this.logger.error("error in setter of elementHeight", err);
            }
        }
    }
    //#endregion

    //#region focusedPositionDimension
    private _focusedPositionDimension: number = -1;
    get focusedPositionDimension(): number {
        return this._focusedPositionDimension;
    }
    set focusedPositionDimension(newVal: number) {
        if (newVal !== this._focusedPositionDimension) {
            if (this._focusedPositionValues !== -1) {
                this.dimensionList.itemsPagingTopSetPromise(
                        this.calcPagingStart(newVal, this.dimensionList.itemsPagingTop, this.dimensionList))
                    .then(() => {
                        this._focusedPositionDimension = newVal;
                    })
                    .catch((e: Error) => {
                        this.logger.error("ERROR in Setter of absolutPosition");
                    });
                return;
            }
            this._focusedPositionDimension = newVal;
        }
    }
    //#endregion

    //#region focusedPositionValues
    private _focusedPositionValues: number = -1;
    get focusedPositionValues(): number {
        return this._focusedPositionValues;
    }
    set focusedPositionValues(newVal: number) {
        if (newVal !== this._focusedPositionValues && this.valueList) {
            if (this._focusedPositionValues !== -1) {
                if (newVal >= this.valueList.itemsPagingTop &&
                    newVal <= this.valueList.itemsPagingTop + this.valueList.itemsPagingHeight - 1) {

                    this._focusedPositionValues = newVal;
                } else {
                    this.valueList.itemsPagingTopSetPromise(this.calcPagingStart(newVal, this.focusedPositionValues, this.valueList))
                        .then(() => {
                            this._focusedPositionValues = newVal;
                        })
                        .catch((e: Error) => {
                            this.logger.error("ERROR in Setter of absolutPosition");
                        });
                    return;
                }
            }
            this._focusedPositionValues = newVal;
        }
    }
    //#endregion

    //#region textSearchDimension Promise Row needs to be changed !!!!
    private _textSearchDimension: string = "";
    get textSearchDimension(): string {
        return this._textSearchDimension;
    }
    set textSearchDimension(value: string) {
        if (value !== this.textSearchDimension) {
            try {
                this._textSearchDimension = value;
                if (!value) {
                    this.dimensionList.obj.searchFor("").then(() => {
                        this.dimensionList.obj.emit("changed", this.dimensionList.itemsPagingHeight);
                        this.dimensionList.itemsCounter = (this.dimensionList.obj as any).model.calcCube.length;
                        this.timeout();
                    });
                    return;
                }

                this.dimensionList.itemsPagingTop = 0;
                this.dimensionList.obj.searchFor(value).then(() => {
                    this.dimensionList.obj.emit("changed", this.dimensionList.itemsPagingHeight);
                    this.dimensionList.itemsCounter = (this.dimensionList.obj as any).model.calcCube.length;
                    this.timeout();
                });

            } catch (err) {
                this.logger.error("error in setter of textSearchValue", err);
            }
        }
    }
    //#endregion

    //#region textSearchValue
    private _textSearchValue: string = "";
    get textSearchValue(): string {
        return this._textSearchValue;
    }
    set textSearchValue(value: string) {
        if (value !== this.textSearchValue) {
            try {
                this.valueList.itemsPagingTop = 0;
                this._textSearchValue = value;
                if (!value) {
                    this.valueList.obj.searchFor("").then(() => {
                        return this.engineGenericObjectVal.getLayout();
                    }).then((res: EngineAPI.IGenericObjectProperties) => {
                        this.valueList.itemsCounter = res.qListObject.qDimensionInfo.qCardinal;
                    }).catch((e: Error) => {
                        this.logger.error("ERROR in Setter of textSearchValue", e);
                    });
                    return;
                }

                this.valueList.itemsPagingTop = 0;
                this.valueList.obj.searchFor(value).then(() => {


                    return this.engineGenericObjectVal.getLayout();
                }).then((res: EngineAPI.IGenericObjectProperties) => {
                    this.valueList.itemsCounter = res.qListObject.qDimensionInfo.qCardinal;
                }).catch((e: Error) => {
                    this.logger.error("ERROR in Setter of textSearchValue", e);
                });
            } catch (err) {
                this.logger.error("error in setter of textSearchValue");
            }
        }
    }
    //#endregion

    //#region showButtonsDimension
    private _showButtonsDimension: boolean = false;
    get showButtonsDimension(): boolean {
        return this._showButtonsDimension;
    }
    set showButtonsDimension(value: boolean) {
        if (this._showButtonsDimension !== value) {
            this._showButtonsDimension = value;
            if (value) {
                this.showButtonsValue = false;
            }
        }
    }
    //#endregion

    //#region showButtonsValue
    private _showButtonsValue: boolean = false;
    get showButtonsValue(): boolean {
        return this._showButtonsValue;
    }
    set showButtonsValue(value: boolean) {
        if (this._showButtonsValue !== value) {
            this._showButtonsValue = value;
            if (value) {
                this.showButtonsDimension = false;
            }
        }
    }
    //#endregion

    static $inject = ["$timeout", "$element", "$scope"];

    /**
     * init of the controller for the Direction Directive
     * @param timeout
     * @param element
     */
    constructor(timeout: ng.ITimeoutService, element: JQuery, scope: ng.IScope) {
        this.element = element;
        this.timeout = timeout;

        this.initMenuElements();

        $(document).on("click" as any, (e: JQueryEventObject) => {
            try {
                if (element.children().children().children().children(".dimensionList").find(e.target).length === 0) {
                    this.showFocusedDimension = false;
                    this.showButtonsDimension = false;
                    this.showSearchFieldDimension = false;
                    this.timeout();
                }

                if (element.children().children().children().children(".valueList").find(e.target).length === 0) {
                    this.showFocusedValue = false;
                    this.showButtonsValue = false;
                    this.showSearchFieldValues = false;
                    this.timeout();
                }
            } catch (e) {
                this.logger.error("Error in Constructor with click event", e);
            }
        });

        scope.$watch(() => {
            return this.element.width();
        }, () => {
            this.elementHeight = this.element.height();
        });
    }

    /**
     * fills the Menu with Elements
     */
    private initMenuElements(): void {
        this.menuListDimension = [];
        this.menuListDimension.push({
            buttonType: "",
            isVisible: true,
            isEnabled: false,
            icon: "clear-selections",
            name: "Clear all selections",
            hasSeparator: false,
            type: "menu"

        });
        this.menuListDimension.push({
            buttonType: "",
            isVisible: true,
            isEnabled: true,
            icon: "selections-forward",
            name: "Step forward",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListDimension.push({
            buttonType: "",
            isVisible: true,
            isEnabled: true,
            icon: "selections-back",
            name: "Step backward",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListDimension.push({
            buttonType: "",
            isVisible: true,
            isEnabled: false,
            icon: "unlock",
            name: "Lock all dimension",
            hasSeparator: false,
            type: "menu"
        });

        this.menuListValues = [];
        this.menuListValues.push({
            buttonType: "success",
            isVisible: true,
            isEnabled: true,
            icon: "tick",
            name: "Confirm Selection",
            hasSeparator: false,
            type: "menu"

        });
        this.menuListValues.push({
            buttonType: "danger",
            isVisible: true,
            isEnabled: false,
            icon: "close",
            name: "Cancle Selection",
            hasSeparator: true,
            type: "menu"
        });
        this.menuListValues.push({
            buttonType: "",
            isVisible: true,
            isEnabled: false,
            icon: "clear-selections",
            name: "clear",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListValues.push({
            buttonType: "",
            isVisible: true,
            isEnabled: true,
            icon: "select-all",
            name: "Select all",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListValues.push({
            buttonType: "",
            isVisible: true,
            isEnabled: false,
            icon: "select-possible",
            name: "Select possible",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListValues.push({
            buttonType: "",
            isVisible: true,
            isEnabled: true,
            icon: "select-alternative",
            name: "Select alternative",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListValues.push({
            buttonType: "",
            isVisible: true,
            isEnabled: true,
            icon: "select-excluded",
            name: "Select excluded",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListValues.push({
            buttonType: "",
            isVisible: true,
            isEnabled: false,
            icon: "unlock",
            name: "Lock dimension",
            hasSeparator: false,
            type: "menu"
        });
        this.menuListValues.push({
            buttonType: "",
            isVisible: true,
            isEnabled: false,
            icon: "debug",
            name: "Scramble Values",
            hasSeparator: false,
            type: "menu"
        });
    }

    /**
     * function which gets called, when the buttons of the menu list gets hit
     * @param item neme of the nutton which got activated
     */
    menuListActionCallback(item: string) {
        switch (item) {
            case "accept":
                this.showButtonsValue = false;
                this.showSearchFieldValues = false;
                this.engineGenericObjectVal.endSelections(true);
                break;
            case "cancel":
                this.showButtonsValue = false;
                this.showSearchFieldValues = false;
                this.engineGenericObjectVal.endSelections(false);
                break;
            case "clear":
                this.engineGenericObjectVal.clearSelections("/qListObjectDef");
                break;
            case "Select all":
                this.engineGenericObjectVal.selectListObjectAll("/qListObjectDef");
                break;
            case "Select possible":
                this.engineGenericObjectVal.selectListObjectPossible("/qListObjectDef");
                break;
            case "Select alternative":
                this.engineGenericObjectVal.selectListObjectAlternative("/qListObjectDef");
                break;
            case "Select excluded":
                this.engineGenericObjectVal.selectListObjectExcluded("/qListObjectDef");
                break;
            case "Clear all selections":
                this.model.app.clearAll(true);
                break;
            case "Step forward":
                this.model.app.forward();
                break;
            case "Step backward":
                this.model.app.back();
                break;
            case "Lock dimension":
                this.lockMenuListValues = true;
                (this.engineGenericObjectVal.lock as any)("/qListObjectDef");
                break;
            case "Lock all dimension":
                this.lockMenuListValues = true;
                (this.model.app.lockAll as any)();
                break;
            case "Scramble Values":
            (this.model.app as any).scramble(this.selectedDimension);
                break;

        }
    }

    /**
     * creates a new session object for the selected dimension
     * @param pos position of the selected extension in the displayed list
     */
    selectDimensionObjectCallback(pos: number): void {
        this.logger.debug("function selectDimensionObjectCallback", " ");
        try {
            if (this.selectedDimension !== this.dimensionList.collection[pos].title) {
                setTimeout(() => {
                    this.showFocusedDimension = true;

                    for (let x of this.dimensionList.collection) {
                        x.status = "A";
                    }

                    // dimension
                    this.selectedDimension = this.dimensionList.collection[pos].title;
                    this.selectedDimensionDefs = this.dimensionList.collection[pos].defs;
                    this.selectedDimensioId = this.dimensionList.collection[pos].id;
                    this.focusedPositionDimension = pos + this.dimensionList.itemsPagingTop;
                    this.dimensionList.collection[pos].status = "S";

                    // values
                    this.valueList = null;
                    this._focusedPositionValues = 0;
                    this.createValueListSessionObjcet(this.selectedDimension, this.selectedDimensionDefs);
                    this.textSearchValue = "";
                    this.titleValues = this.dimensionList.collection[pos].title;
                    // others
                    this.statusText = "Dimension " + this.dimensionList.collection[pos].title + " gewählt";

                }, this.actionDelay);

            }
        } catch (err) {
            this.logger.error("ERROR in selectDimension", err);
        }
    }

    /**
     * callback when selecting Value in the value List
     * @param pos position from the selected Value
     */
    selectListObjectCallback(pos: number, event?: JQueryKeyEventObject): void {
        if (typeof(event) === "undefined") {
            return;
        }
        let assistItemsPagingTop = this.valueList.itemsPagingTop;
        setTimeout(() => {
            this.showFocusedValue = true;
            this.showButtonsValue = true;

            this.engineGenericObjectVal.selectListObjectValues(
                "/qListObjectDef", (this.valueList.collection[pos].id as any), (event && event.ctrlKey) ? false : true)
                .then(() => {
                    this.focusedPositionValues = pos + this.valueList.itemsPagingTop;
                    this.valueList.itemsPagingTop = assistItemsPagingTop;
                    this.statusText = "Dimension " + this.valueList.collection[pos].title + " gewählt";
                }).catch((err: Error) => {
                    this.logger.error("ERROR in selectListObjectCallback", err);
                });
        }, this.actionDelay);
    }

    /**
     * creates the session object for the selected dimension by dimension name
     * @param dimensionName name of the diminsion the new session object should be create for
     */
    private createValueListSessionObjcet(dimensionName: string, dimensionFieldDefs: Array<string>): void {
        if (this.engineGenericObjectVal) {
            this.model.app.destroySessionObject(this.engineGenericObjectVal.id)
                .then(() => {
                    this.createValueListSessionObjectAssist(dimensionName, dimensionFieldDefs);
                })
                .catch((err: Error) => {
                    this.logger.error("Error in createValueListSessionObjcet", err);
                });
        } else {
            this.createValueListSessionObjectAssist(dimensionName, dimensionFieldDefs);
        }
    }

    /** TO DO vorhandener list Object den Feldwert ändern -> folgend muss alles sich von alleine neuberechne
     * creates the session object for the selected dimension by dimension name assist
     * @param dimensionName name of the diminsion the new session object should be create for
     * @param dimensionFieldDefs definition of the diminsion the new session object should be create for
     */
    private createValueListSessionObjectAssist(dimensionName: string, dimensionFieldDefs: Array<string>): void {
        var parameter: EngineAPI.IGenericObjectProperties = {
            "qInfo": {
                "qType": "ListObject"
            },
            "qListObjectDef": {
                "qStateName": "$",
                "qLibraryId": "",
                "qDef": {
                    "qFieldDefs": dimensionFieldDefs,
                    "qGrouping": "N",
                    "autoSort": false,
                    "qActiveField": 0,
                    "qFieldLabels": [dimensionName],
                    "qSortCriterias": [{
                        "qSortByState": 1,
                        "qSortByAscii": 1
                    }]
                },
                "qAutoSortByState": {
                    "qDisplayNumberOfRows": -1
                },
                "qFrequencyMode": "EQ_NX_FREQUENCY_NONE",
                "qShowAlternatives": true,
                "qInitialDataFetch": [
                    {
                        "qTop": 0,
                        "qLeft": 0,
                        "qHeight": 0,
                        "qWidth": 1
                    }
                ]
            },
            "description": "Description of the list object"
        };


        this.model.app.createSessionObject(parameter)
            .then((genericObject: EngineAPI.IGenericObject) => {
                this.engineGenericObjectVal = genericObject;

                genericObject.getLayout().then((res: EngineAPI.IGenericObjectProperties) => {
                    this.valueList = new utils.Q2gListAdapter(
                        new utils.Q2gListObject(
                            genericObject),
                            this.dimensionList.itemsPagingHeight,
                        res.qListObject.qDimensionInfo.qCardinal,
                        "qlik"
                    );

                    let that = this;
                    genericObject.on("changed", function () {
                        that.valueList.obj.emit("changed", that.dimensionList.itemsPagingHeight);
                        genericObject.getLayout().then((res: EngineAPI.IGenericObjectProperties) => {
                            that.checkAvailabilityOfMenuListElementsValue(res.qListObject.qDimensionInfo);
                            that.checkIfDimIsLocked(res.qListObject.qDimensionInfo);
                        });
                    });
                    genericObject.emit("changed");
                });
            })
            .catch((err: Error) => {
                this.logger.error("ERROR", err);
            });
    }

    /**
     * calculates the new Paging Start Position when absolut position is out of Paging size
     * @param newVal the new Value of the focusedPosition
     * @param focusedPosition the old value of the focusedPosition
     * @param object the list object, in which the changes shoud be done
     */
    private calcPagingStart(newVal: number, focusedPosition: number, object: utils.IQ2gListAdapter): number {

        // absolutPosition out of sight below
        if (focusedPosition < object.itemsPagingTop && focusedPosition >= 0) {
            return newVal;
        }

        // absolutPosition out of sight above
        if (focusedPosition > object.itemsPagingTop + this.dimensionList.itemsPagingHeight) {
            return newVal - this.dimensionList.itemsPagingHeight + 1;
        }

        // absolutPosition steps out of page below
        if (newVal < object.itemsPagingTop) {
            return object.itemsPagingTop - 1;
        }

        // absolutPosition steps out of page above
        if (newVal >= object.itemsPagingTop + this.dimensionList.itemsPagingHeight) {
            return object.itemsPagingTop + 1;
        }

        return object.itemsPagingTop;
    }

    /**
     * shortcuthandler to clears the made selection
     * @param objectShortcut object wich gives you the shortcut name and the element, from which the shortcut come from
     */
    shortcutHandler(shortcutObject: directives.IShortcutObject, domcontainer: utils.IDomContainer): boolean {

        switch (shortcutObject.name) {

            case "focusDimensionList":
                try {
                    this.showFocusedDimension = true;
                    this.showFocusedValue = false;
                    this.timeout();
                    if (this.focusedPositionDimension < 0) {
                        this.focusedPositionDimension = 0;
                        domcontainer.element.children().children().children()[0].focus();
                        this.timeout();
                        return true;
                    }

                    if (this.focusedPositionDimension >= this.dimensionList.collection.length) {
                        this.focusedPositionDimension = 0;
                        domcontainer.element.children().children().children()[0].focus();
                        this.timeout();
                        return true;
                    }

                    if (this.focusedPositionDimension < this.dimensionList.itemsPagingTop) {
                        this.dimensionList.itemsPagingTop = this.focusedPositionDimension;
                    } else if (this.focusedPositionDimension >
                        this.dimensionList.itemsPagingTop + this.dimensionList.itemsPagingHeight) {
                        this.dimensionList.itemsPagingTop
                            = this.focusedPositionDimension - (this.dimensionList.itemsPagingHeight + 1);

                    }

                    domcontainer.element.children().children().children().children()[
                        this.focusedPositionDimension - this.dimensionList.itemsPagingTop
                    ].focus();
                    return true;
                } catch (e) {
                    this.logger.error("Error in shortcut Handler", e);
                    return false;
                }

            case "focusSearchDimension":
                try {
                    this.showFocusedDimension = false;
                    this.timeout();
                    domcontainer.element.focus();
                    return true;
                } catch (e) {
                    this.logger.error("Error in shortcut Handler", e);
                    return false;
                }

            case "clearselection":
                this.textSearchDimension = "";
                this.textSearchValue = "";
                this.model.app.clearAll(true).then(() => {
                    this.statusText = "Selektionen wurden gelöscht";
                }).catch((e: Error) => {
                    this.logger.error("error in shortcutHandlerClear", e);
                    });
                return true;

            case "focusSearchValue":
                this.showFocusedValue = false;
                domcontainer.element.focus();
                return true;

            case "focusValueList":
                this.showFocusedDimension = false;
                this.showFocusedValue = true;
                this.timeout();
                if (this.valueList.collection) {
                    if (this.focusedPositionValues < 0 ||
                        this.focusedPositionValues >= this.valueList.collection.length ||
                        this.focusedPositionValues >= this.dimensionList.itemsPagingHeight + this.valueList.itemsPagingTop) {
                        this.focusedPositionValues = 0;
                        this.valueList.itemsPagingTop = 0;
                        domcontainer.element.children().children().children().children()[0].focus();
                        this.timeout();
                        return true;
                    }

                    if (this.focusedPositionValues < this.valueList.itemsPagingTop) {
                        this.valueList.itemsPagingTop = this.focusedPositionValues;
                    } else if (this.focusedPositionValues > this.valueList.itemsPagingTop + this.dimensionList.itemsPagingHeight) {
                        this.valueList.itemsPagingTop = this.focusedPositionValues - (this.dimensionList.itemsPagingHeight + 1);
                    }
                    domcontainer.element.children().children().children().children()[
                        this.focusedPositionValues - this.valueList.itemsPagingTop
                    ].focus();
                }
                return true;

            case "escape":
                if (this.textSearchDimension.length > 0 || this.textSearchValue.length > 0) {
                    if (domcontainer.element.parent().find(":focus").length > 0) {
                        switch (domcontainer.element[0].getAttribute("ng-model")) {
                            case "vm.textSearchDimension":
                                this.textSearchDimension = "";
                                break;
                            case "vm.textSearchValue":
                                this.textSearchValue = "";
                                break;
                        }
                    } else {
                        domcontainer.element.blur();
                    }
                }
                return true;

            case "acceptSearch":
                setTimeout(() => {
                    this.engineGenericObjectVal.acceptListObjectSearch("/qListObjectDef", true)
                        .then(() => {
                            this.statusText = "Alle gesuchten Werte gewählt";
                        }).catch((err: Error) => {
                            this.logger.error("ERROR in selectListObjectCallback", err);
                        });
                }, this.actionDelay);
                return true;

            case "escDimension":
                try {
                    if (this.textSearchDimension === "") {
                        this.showSearchFieldDimension = false;
                    }
                    return true;
                } catch (e) {
                    this.logger.error("Error in shortcutHandlerExtensionHeader", e);
                    return false;
                }

            case "escValues":
                try {
                    if (this.textSearchValue === "") {
                        this.showSearchFieldValues = false;
                    }
                    return true;
                } catch (e) {
                    this.logger.error("Error in shortcutHandlerExtensionHeader", e);
                    return false;
                }
        }

        return false;
    }

    /**
     * checks if the extension is used in Edit mode
     */
    isEditMode(): boolean {
        if (this.editMode) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * saves the Properties from the getLayout call from qlik enine in own Object
     * @param properties Properties from getLayout call
     */
    private getProperties(properties: any): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.properties.shortcutFocusDimensionList = properties.shortcutFocusDimensionList;
            this.properties.shortcutFocusValueList = properties.shortcutFocusValueList;
            this.properties.shortcutFocusSearchField = properties.shortcutFocusSearchField;
            this.properties.shortcutClearSelection = properties.shortcutClearSelection;
            if (properties.useAccessibility) {
                this.timeAriaIntervall = parseInt(properties.aria.timeAria, 10);
                this.actionDelay = parseInt(properties.aria.actionDelay, 10);
            }
            this.useReadebility = properties.aria.useAccessibility;
            resolve();
        });
    }

    private checkAvailabilityOfMenuListElementsValue(object: any): void {

        // select-excluded
        this.menuListValues[6].isEnabled = !(object.qStateCounts.qExcluded > 0 || object.qStateCounts.qAlternative > 0);

        // select-alternative
        this.menuListValues[5].isEnabled = !(object.qStateCounts.qExcluded > 0 || object.qStateCounts.qAlternative > 0);

        // select - possible
        this.menuListValues[4].isEnabled = !(object.qStateCounts.qOption > 0);

        // select - all
        this.menuListValues[3].isEnabled = !(object.qStateCounts.qSelected + object.qStateCounts.qSelectedExcluded
                !== object.qCardinal
            || object.qStateCounts.qOption
                === object.qCardinal);

        // clear-selections
        this.menuListValues[2].isEnabled = !(object.qStateCounts.qSelected > 0);

        this.menuListValues = JSON.parse(JSON.stringify(this.menuListValues));
    }

    private checkAvailabilityOfMenuListElementsDimension(): void {

        let promForward: Promise<any> = this.model.app.forwardCount();
        let promBackward: Promise<any> = this.model.app.backCount();

        Promise.all([promForward, promBackward])
            .then((res:Array<any>) => {
                this.menuListDimension[1].isEnabled = res[0]>0 ? false : true;
                this.menuListDimension[2].isEnabled = res[1]>0 ? false : true;
                this.menuListDimension = JSON.parse(JSON.stringify(this.menuListDimension));
            });
    }

    private checkIfDimIsLocked(obj: EngineAPI.INxStateCounts) {
        this.lockMenuListValues = obj.qLocked > 0 || obj.qLockedExcluded > 0 ? true : false;
    }

    private buildDimensionList(object: EngineAPI.IGenericObject): Promise<boolean> {
        return new Promise((resolve, reject) => {
            object.getLayout()
            .then((res: EngineAPI.IGenericHyperCubeLayout) => {
                this.checkAvailabilityOfMenuListElementsDimension();
                if (!this.dimensionList.obj || !this.dimensionList) {
                    let dimObject = new utils.Q2gIndObject(new utils. AssistHyperCubeDimensionsInd(res));
                    this.dimensionList = new utils.Q2gListAdapter(
                        dimObject, this.dimensionList.itemsPagingHeight,
                        res.qHyperCube.qDimensionInfo.length, "dimension");
                } else {
                    this.dimensionList.updateList(
                        new utils.Q2gIndObject(
                            new utils.AssistHyperCubeDimensionsInd(res)),
                            this.dimensionList.itemsPagingHeight,
                        res.qHyperCube.qDimensionInfo.length);
                }
                resolve(true);
            })
            .catch((error) => {
                reject(error);
            });
        });
    }

    private buildListProperties(): EngineAPI.IGenericObjectProperties {
        let returnProperties: EngineAPI.IGenericObjectProperties = {
            "qInfo": { "qType": "FieldList" },
            "qFieldListDef": {
                "qShowSystem": true,
                "qShowHidden": true,
                "qShowSemantic": true,
                "qShowSrcTables": true,
                "qShowDefinitionOnly": true,
                "qShowDerivedFields": true,
                "qShowImplicit": true
            }
        };
        return returnProperties;
    }

    private buildFieldList(object: EngineAPI.IGenericObject): Promise<boolean> {
        return new Promise((resolve, reject) => {

            object.app.createSessionObject(this.buildListProperties())
                .then((sessionObject) => {
                    return sessionObject.getLayout();
                })
                .then((res: any) => {
                    this.checkAvailabilityOfMenuListElementsDimension();
                    if (!this.dimensionList.obj || !this.dimensionList) {
                        let dimObject = new utils.Q2gIndObject(new utils. AssistHyperCubeFields(res));
                        this.dimensionList = new utils.Q2gListAdapter(
                            dimObject, this.dimensionList.itemsPagingHeight,
                            (res as any).qFieldList.qItems.length, "dimension");
                    } else {
                        this.dimensionList.updateList(
                            new utils.Q2gIndObject(
                                new utils.AssistHyperCubeFields(res)),
                                this.dimensionList.itemsPagingHeight,
                                (res as any).qFieldList.qItems.length);
                    }



                    resolve(true);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }
}

export function SelectionsDirectiveFactory(rootNameSpace: string): ng.IDirectiveFactory {
    "use strict";
    return ($document: ng.IAugmentedJQuery, $injector: ng.auto.IInjectorService, $registrationProvider: any) => {
        return {
            restrict: "E",
            replace: true,
            template: utils.templateReplacer(template, rootNameSpace),
            controller: SelectionsController,
            controllerAs: "vm",
            scope: {},
            bindToController: {
                model: "<",
                theme: "<?",
                editMode: "<?"
            },
            compile: ():void => {
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ListViewDirectiveFactory(rootNameSpace), "Listview");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.StatusTextDirectiveFactory(rootNameSpace),"StatusText");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ShortCutDirectiveFactory(rootNameSpace), "Shortcut");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.IdentifierDirectiveFactory(rootNameSpace), "AkquinetIdentifier");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ExtensionHeaderDirectiveFactory(rootNameSpace), "ExtensionHeader");
            }
        };
    };
}


