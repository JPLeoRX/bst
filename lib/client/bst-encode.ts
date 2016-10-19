/**
 * Created by jpk on 10/13/16.
 */

import {FileUtil} from "../core/file-util";
import * as path from "path";
import * as http from "http";
import {IncomingMessage} from "http";
const AWS = require("aws-sdk");

export interface AWSEncoderConfig {
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
}

/**
 * Encodes an audio file so that it can be used in Alexa responses, as part of an &lt;audio&gt; tag in an SSML response.
 *
 * Allows for the use of pre-recorded audio in "regular" (i.e., non-AudioPlayer) skills. More info [here](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/handling-requests-sent-by-alexa#h2_pre-recorded-audio).
 *
 * Once the audio is encoded, BSTEncode uploads it to S3 so it is accessible to Alexa.
 *
 * Audio is encoded in compliance with [Alexa standards]{@link https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/speech-synthesis-markup-language-ssml-reference}:
 * MP3, 48 kbps, 16000 hz
 */
export class BSTEncode {
    private static EncoderHost = "elb-ecs-bespokenencoder-dev-299768275.us-east-1.elb.amazonaws.com";
    private static EncoderPath = "/encode";

    private _awsConfiguration: AWSEncoderConfig;

    /**
     * The [awsConfiguration]{@link AWSEncoderConfig} contains AWS credentials and S3 bucket to upload to
     * @param awsConfiguration
     */
    public constructor(awsConfiguration: AWSEncoderConfig) {
        this._awsConfiguration = awsConfiguration;
    }

    /**
     * Encodes a file and publishes it to S3
     * @param filePath
     * @param callback Returns the URL of the encoded file on S3. Error if there is any.
     */
    public encodeFileAndPublish(filePath: string, callback: (error: Error, encodedURL: string) => void): void {
        const self = this;
        FileUtil.readFile(filePath, function(data: Buffer) {
            const fp = path.parse(filePath);
            const filename = fp.name + fp.ext;
            self.uploadFile(self._awsConfiguration.bucket, filename, data, function (url: string) {
                self.callEncode(url, function(error: Error, encodedURL: string) {
                    callback(error, encodedURL);
                });
            });
        });
    }

    /**
     * Encodes a URL and publishes it to S3
     * @param sourceURL The URL of the file to encode
     * @param callback Returns the URL of the encoded file on S3. Error if there is any.
     */
    public encodeURLAndPublish(sourceURL: string, callback: (error: Error, encodedURL: string) => void): void {
        const self = this;
        self.callEncode(sourceURL, function(error: Error, encodedURL: string) {
            callback(error, encodedURL);
        });
    }

    private uploadFile(bucket: string, name: string, data: Buffer, callback: (uploadedURL: string) => void) {
        if (this._awsConfiguration === undefined) {
            throw new Error("No AWS Configuration parameters defined");
        }

        const credentials = {
            accessKeyId: this._awsConfiguration.accessKeyId,
            secretAccessKey: this._awsConfiguration.secretAccessKey
        };

        const config = {
            credentials: credentials
        };

        const s3 = new AWS.S3(config);

        const params = {Bucket: bucket, Key: name, Body: data, ACL: "public-read"};
        s3.putObject(params, function (error: Error) {
            callback(BSTEncode.urlForS3(bucket, name));
        });
    }

    private callEncode(sourceURL: string, callback: (error: Error, encodedURL: string) => void) {
        const self = this;
        let filename = sourceURL.substring(sourceURL.lastIndexOf("/") + 1);
        if (filename.indexOf("?") !== -1) {
            filename = filename.substring(0, filename.indexOf("?"));
        }

        const basename = filename.substring(0, filename.indexOf("."));
        const newFilename = basename + "-encoded.mp3";

        const options = {
            host: BSTEncode.EncoderHost,
            path: BSTEncode.EncoderPath,
            method: "POST",
            headers: {
                accessKeyId: this._awsConfiguration.accessKeyId,
                accessSecretKey: this._awsConfiguration.secretAccessKey,
                sourceURL: sourceURL,
                targetBucket: this.bucket(),
                targetKey: newFilename
            }
        };

        let responseData = "";
        const request = http.request(options, function (response: IncomingMessage) {
            if (response.statusCode !== 200) {
                callback(new Error(response.statusMessage), null);
            } else {
                response.on("data", function(data: Buffer) {
                    responseData += data.toString();
                });

                response.on("end", function () {
                    const officialURL = BSTEncode.urlForS3(self.bucket(), newFilename);
                    callback(null, officialURL);
                });
            }
        });

        request.end();
    }

    private bucket(): string {
        return this._awsConfiguration.bucket;
    }

    private static urlForS3(bucket: string, key: string) {
        return "https://s3.amazonaws.com/" + bucket + "/" + key;
    }
}