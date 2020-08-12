import {
    Component,
    OnInit,
    Input,
    ViewChild,
    ElementRef,
    OnChanges,
    Output,
    EventEmitter,
} from '@angular/core';
import { NotificationsService } from 'angular2-notifications';
import { NgxSpinnerService } from 'ngx-spinner';

import { faSearchPlus } from '@fortawesome/free-solid-svg-icons';
import { faSearchMinus } from '@fortawesome/free-solid-svg-icons';
import { faHome } from '@fortawesome/free-solid-svg-icons';
import { faExpandArrowsAlt } from '@fortawesome/free-solid-svg-icons';
import { faQuestionCircle } from '@fortawesome/free-solid-svg-icons';

import { Dictionary } from 'lodash';
import Chart from 'chart.js'; // import chartjs lib
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';

declare var OpenSeadragon: any;
declare var $: any; // include jquery

@Component({
    selector: 'app-mitosisdetector',
    templateUrl: './mitosisdetector.component.html',
    styleUrls: ['./mitosisdetector.component.scss'],
})
export class MitosisdetectorComponent implements OnInit {
    private BASE_URL = environment.API_URL;

    @Output('getImagesList') getImagesList: EventEmitter<
        any
    > = new EventEmitter();

    // **image src data from parent component
    @Input('imageSrc') imageSrc: any;
    // **image canvas
    @ViewChild('mycanvas') mycanvas: ElementRef;

    // **flags
    initialLoading: boolean = true; // used to indicate if it is initially loading
    imageSelected: boolean = false;
    isLoaded: boolean = false;
    isDetailsDisabled: boolean = false;
    labelClicked: boolean = false; // used to indicate if the action raised by label click

    // **dynamic style
    overflowX: any;
    overflowY: any;

    // **variables
    threshold: Number;
    prediction: any;
    modalImgSrc: any;
    image: any;
    imageName: any;
    systemMsg: string;
    models: any[] = ['DefaultModel'];
    selectedModel: any;
    labels: Array<string> = [];
    labelsCount: Dictionary<any> = {};
    labelsTxtStyle: Dictionary<any> = {}; // boolean value to indicate if each label is removed
    colorHash: Dictionary<string> = {
        MF: '#007bff',
        MFM: '#ffc107',
        MFA: '#28a745',
        MFgranular: '#dc3545',
    };
    myChart: any = null;

    // osd viewer
    viewer: any;

    // data for annotator
    dataForAnnotator: any = [];

    // font awesome icons
    faSearchPlus = faSearchPlus;
    faSearchMinus = faSearchMinus;
    faHome = faHome;
    faExpandArrowsAlt = faExpandArrowsAlt;
    faQuestionCircle = faQuestionCircle;

    constructor(
        private http: HttpClient,
        private _spinner: NgxSpinnerService,
        private _notifications: NotificationsService
    ) {}

    ngOnInit(): void {
        this.threshold = 0.5;
        this.selectedModel = this.models[0]; // default model

        this.updateFlags(false, 'loading selected image');
        this.setContainerOverflow('hidden', 'hidden');
        this._spinner.show();

        // load image. why using timeout? waiting for DOM elements fully loaded
        setTimeout(() => {
            this.onImageLoad();
            this.initialLoading = false;
        }, 2000);
    }

    ngOnChanges() {
        if (!this.initialLoading) {
            this.updateFlags(false, 'loading selected image');
            this._spinner.show();

            setTimeout(() => {
                this.onImageLoad();
            }, 2000);
        }
    }

    async onImageLoad() {
        this.image = this.imageSrc; // src from child component
        this.imageName = this.imageSrc.name;
        this.threshold = 0.5;

        const self = this;
        // processing image preview
        let reader = new FileReader();
        reader.onload = function (event) {
            var img = new Image();
            img.addEventListener('load', function () {
                this.width = img.width;
                this.height = img.height;

                self.setOsdObject(img.src);
                const { canvas } = self.viewer.drawer;

                canvas.width = this.width;
                canvas.height = this.height;

                self._spinner.hide();
                self.popUpNotification(200, `${self.imageName} loaded`);

                // context.clearRect(0, 0, canvas.width, canvas.height);
                // context.drawImage(img, 0, 0, this.width, this.height);
            });
            img.src = <string>event.target.result;
        };
        reader.readAsDataURL(this.image);
    }

    setOsdObject(url) {
        // clear osd element
        $('#detectorViewer').empty();
        // osd viewer
        this.viewer = OpenSeadragon({
            crossOriginPolicy: 'Anonymous',
            id: 'detectorViewer',
            prefixUrl: '../../assets/openseadragon/images/',
            showNavigator: true,
            // toolbar: 'detector-osd-navbar',
            tileSources: {
                type: 'image',
                url: url,
            },
        });
    }

    onDetectClick() {
        // toggle modal
        $('#uploadConfirmModal').modal('show');
    }

    onConfirm() {
        // toggle confirm modal
        $('#uploadConfirmModal').modal('hide');
        this.updateFlags(false, 'retrieving prediction result from server');
        this._spinner.show();
        // get form data ready
        let formData = new FormData();
        formData.append('file', this.image);
        formData.append('modelName', this.selectedModel);

        // predict api call
        this.http
            .post<any>(`${this.BASE_URL}/api/detect/mitosis`, formData)
            .subscribe(
                (res) => {
                    this.popUpNotification(res.code, res.message);
                    // callback data
                    // console.log(res.prediction)
                    this.prediction = res.prediction;
                    // processing res data
                    // and generate rects
                    this.drawOnCanvas();
                    this._spinner.hide();
                    this.updateFlags(true, 'upload image to start');
                    // update existing images list
                    this.getImagesList.emit();
                },
                (err) => {
                    console.log(err);
                    this.popUpNotification(400, err);
                    this._spinner.hide();
                    this.updateFlags(false, `${err}, please try again :/`);
                }
            );
    }

    drawOnCanvas() {
        const self = this;
        self.dataForAnnotator = [];
        // label related vars
        self.labels = self.labelClicked ? self.labels : [];
        self.labelsCount = self.labelClicked ? self.labelsCount : {};
        self.labelsTxtStyle = self.labelClicked ? self.labelsTxtStyle : {};
        // set up canvas
        // let canvas = this.mycanvas.nativeElement;
        let canvas = document.createElement('canvas');
        let context = canvas.getContext('2d');
        // draw
        var reader = new FileReader();
        reader.onload = function (event) {
            var img = new Image();
            img.addEventListener('load', function () {
                this.width = img.width;
                this.height = img.height;
                canvas.width = this.width;
                canvas.height = this.height;
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(img, 0, 0, this.width, this.height);

                const row = Math.ceil(img.height / 800);
                const column = Math.ceil(img.width / 800);
                const nums =
                    Math.ceil(img.height / 800) * Math.ceil(img.width / 800);

                for (let idx = 0; idx < nums; idx++) {
                    let defaultWidth = 800 * Math.floor(idx / row);
                    let defaultHeight = 800 * (idx % row);
                    for (
                        let i = 0;
                        i < self.prediction.boxes[idx].length;
                        i++
                    ) {
                        if (self.prediction.scores[idx][i] > self.threshold) {
                            const box = self.prediction.boxes[idx][i];
                            if (!self.labelClicked) {
                                // only reload related data on initial loading or when threshold adjusted
                                if (
                                    self.labels.indexOf(
                                        self.prediction.names[idx][i]
                                    ) === -1
                                ) {
                                    self.labels.push(
                                        self.prediction.names[idx][i]
                                    );
                                    Object.assign(self.labelsCount, {
                                        [self.prediction.names[idx][i]]: 1,
                                    });
                                    Object.assign(self.labelsTxtStyle, {
                                        [self.prediction.names[idx][i]]: 'none',
                                    });
                                } else {
                                    self.labelsCount[
                                        self.prediction.names[idx][i]
                                    ] += 1;
                                }
                            }
                            if (
                                self.labelsTxtStyle[
                                    self.prediction.names[idx][i]
                                ] === 'none'
                            ) {
                                context.fillStyle = 'rgba(255,255,255,0.2)';
                                context.strokeStyle =
                                    self.colorHash[
                                        self.prediction.names[idx][i]
                                    ];
                                context.fillRect(
                                    box[1] * 800 + defaultWidth,
                                    box[0] * 800 + defaultHeight,
                                    800 * (box[3] - box[1]),
                                    800 * (box[2] - box[0])
                                );
                                context.font = '15px Arial';
                                context.fillStyle = 'white';
                                context.fillText(
                                    self.prediction.names[idx][i],
                                    box[1] * 800 + defaultWidth,
                                    box[0] * 800 + defaultHeight - 5,
                                    box[0] * 800 + defaultHeight
                                );
                                context.lineWidth = 2.5;
                                context.strokeRect(
                                    box[1] * 800 + defaultWidth,
                                    box[0] * 800 + defaultHeight,
                                    800 * (box[3] - box[1]),
                                    800 * (box[2] - box[0])
                                );

                                // @
                                // process data list for annotator
                                // @
                                self.dataForAnnotator.push({
                                    name: self.prediction.names[idx][i],
                                    x: box[1] * 800 + defaultWidth,
                                    y: box[0] * 800 + defaultHeight,
                                    w: 800 * (box[3] - box[1]),
                                    h: 800 * (box[2] - box[0]),
                                    color:
                                        self.colorHash[
                                            self.prediction.names[idx][i]
                                        ],
                                });
                            }
                        }
                    }
                }

                // display detected image on osd
                self.setOsdObject(canvas.toDataURL());

                self.labelClicked = false;
            });
            img.src = <string>event.target.result;
        };
        reader.readAsDataURL(self.image);
    }

    updateThreshold() {
        this.drawOnCanvas();
        this.popUpNotification(
            200,
            `${this.threshold} probability threshold value applied`
        );
    }

    onDetailClick() {
        this.generateChart();
        // toggle modal
        $('#detailsModal').modal('show');
    }

    onLabelClick(label) {
        this.labelClicked = true;

        this.labelsTxtStyle[label] === 'none'
            ? (this.labelsTxtStyle[label] = 'line-through')
            : (this.labelsTxtStyle[label] = 'none');

        // check if details btn needs to be disabled
        Object.values(this.labelsTxtStyle).indexOf('none') === -1
            ? (this.isDetailsDisabled = true)
            : (this.isDetailsDisabled = false);

        this.drawOnCanvas();
    }

    // TOOLS *****
    // update flags
    updateFlags(loaded: boolean, msg: string, selected: boolean = true) {
        this.isLoaded = loaded;
        this.systemMsg = msg;
        this.imageSelected = selected;
    }

    setContainerOverflow(x: string, y: string) {
        this.overflowX = x;
        this.overflowY = y;
    }

    popUpNotification(code, message) {
        if (code == 100) {
            this._notifications.info('notification', message, {
                timeOut: 1000,
                showProgressBar: false,
            });
        } else if (code == 200) {
            this._notifications.success('success', message);
        } else {
            this._notifications.error('error', message);
        }
    }

    urltoFile(url, filename, mimeType) {
        return fetch(url)
            .then(function (res) {
                return res.arrayBuffer();
            })
            .then(function (buf) {
                return new File([buf], filename, { type: mimeType });
            });
    }

    toBase64 = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });

    generateChart() {
        // process data
        let _data = {
            labels: [],
            datasets: [
                {
                    label: '# of labels',
                    data: [],
                    backgroundColor: [],
                },
            ],
        };
        this.labels.forEach((label) => {
            if (this.labelsTxtStyle[label] === 'none') {
                _data.labels.push(label);
                _data.datasets[0].data.push(this.labelsCount[label]);
                _data.datasets[0].backgroundColor.push(this.colorHash[label]);
            }
        });
        if (this.myChart != null) {
            this.myChart.destroy();
        }
        // create Chart object
        var ctx = $('#myChart');
        this.myChart = new Chart(ctx, {
            type: 'doughnut',
            data: _data,
        });
    }
}