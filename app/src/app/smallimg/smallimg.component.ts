import { Component, ViewChild, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
// detector component
import { DetectorComponent } from '../detector/detector.component';
declare var $: any; // include jquery

import { faQuestionCircle } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-smallimg',
    templateUrl: './smallimg.component.html',
    styleUrls: ['./smallimg.component.scss'],
})
export class SmallimgComponent implements OnInit {
    private BASE_URL = environment.API_URL;

    @ViewChild(DetectorComponent) detector;

    isImageSelected: boolean = false;

    image: any;
    imageName: any;
    imageWidth: any;
    imageHeight: any;

    selectedSample: any = null;
    samples: any = [];

    faQuestionCircle = faQuestionCircle;

    constructor(private http: HttpClient) {}

    ngOnInit(): void {
        this.fetchImagesList();
    }

    async onSampleSelect(event) {
        this.isImageSelected = false;
        // create file object
        const value = event.target.value;
        let response = await fetch(`${this.BASE_URL}/public/brain/segmented/${value}`);
        let data = await response.blob();
        let metadata = {
            type: 'image/jpeg',
        };
        let file = new File([data], value, metadata);
        this.image = file;
        this.isImageSelected = true;
    }

    async onImageSelect(event) {
        if (event.target.files.length > 0) {
            const self = this;

            this.isImageSelected = false;
            this.image = event.target.files[0];
            this.imageName = event.target.files[0].name;

            // check if image size is less than 2000*2000
            let img = new Image();
            img.addEventListener('load', function () {
                self.imageWidth = img.width;
                self.imageHeight = img.height;

                if (img.width <= 2000 && img.height <= 2000) {
                    self.selectedSample = null;
                    self.isImageSelected = true;
                } else {
                    // toggle confirm modal
                    $('#uploadErrModal').modal('show');
                }
            });
            img.src = <string>await this.toBase64(event.target.files[0]);
        }
    }

    fetchImagesList() {
        this.http.get(`${this.BASE_URL}/brain/segmented`).subscribe(
            (res) => {
                this.samples = (<Object>res)['files'];
            },
            (err) => {
                console.log(err);
            }
        );
    }

    // to base64
    toBase64 = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
}
