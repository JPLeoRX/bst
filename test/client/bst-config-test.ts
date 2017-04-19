/// <reference path="../../typings/index.d.ts" />

import * as assert from "assert";
import * as fs from "fs";
import * as sinon from "sinon";
import {BSTConfig} from "../../lib/client/bst-config";
import {exec} from "child_process";
import {ProxyType, BSTProxy} from "../../lib/client/bst-proxy";
import {BSTProcess} from "../../lib/client/bst-config";
import SinonSandbox = Sinon.SinonSandbox;
import {Global} from "../../lib/core/global";

describe("BSTConfig", function() {
    describe("#bootstrap()", function() {
        (<any> BSTConfig).configDirectory = function () {
            return "test/resources/.bst";
        };

        beforeEach(function (done) {
            exec("rm -rf " + (<any> BSTConfig).configDirectory(), function () {
                done();
            });
        });

        afterEach(function () {

        });

        it("Test new config created correctly", async function () {
            this.timeout(5000);
            await (<any> BSTConfig).bootstrapIfNeeded();
            assert(fs.existsSync((<any> BSTConfig).configPath()));
        });

        it("Loads existing config", async function (done) {
            this.timeout(5000);

            // Make sure we have a new one
            let config = await BSTConfig.load();
            let secretKey = config.secretKey();

            // Make sure it does not get created again
            let config2 = await BSTConfig.load();
            assert.equal(config2.secretKey(), secretKey);
            done();
        });

        it("Updates existing config", async function (done) {
            this.timeout(5000);

            // Make sure we have a new one
            let config = await BSTConfig.load();
            let secretKey = config.secretKey();
            config.updateApplicationID("12345678");

            // Make sure it does not get created again
            let config2 = await BSTConfig.load();
            assert.equal(config2.secretKey(), secretKey);
            assert.equal(config2.applicationID(), "12345678");
            done();
        });

    });
});

describe("BSTProcess", function() {
    describe("#run()", function() {
        let sandbox: SinonSandbox = null;
        beforeEach(function (done) {
            exec("rm -rf " + (<any> BSTConfig).configDirectory(), function () {
                done();
            });

            sandbox = sinon.sandbox.create();
        });

        afterEach(function () {
            sandbox.restore();
        });

        it("Test new process written", async function (done) {
            await BSTConfig.load();
            BSTProcess.run(9000, ProxyType.LAMBDA, 9999);

            let data = fs.readFileSync((<any> BSTProcess).processPath());
            let dataJSON = JSON.parse(data.toString());
            assert(dataJSON);
            assert.equal(dataJSON.pid, 9999);
            done();
        });

        it("Test existing process loaded", async function (done) {
            await BSTConfig.load();
            BSTProcess.run(9000, ProxyType.LAMBDA, 9999);

            // We stub is running because that is tricky to test
            sandbox.stub(BSTProcess, "isRunning", function (pid: string) {
                assert.equal(pid, 9999);
                return true;
            });

            let p = BSTProcess.running();
            assert.equal(p.pid, 9999);
            done();
        });

        it("Test existing process not running", async function (done) {
            await BSTConfig.load();
            BSTProcess.run(9000, ProxyType.LAMBDA, 9999);

            // We stub is running because that is tricky to test
            sandbox.stub(BSTProcess, "isRunning", function (pid: string) {
                assert.equal(pid, 9999);
                return false;
            });

            let p = BSTProcess.running();
            assert(p === null);
            done();
        });

        it("Tests REAL process is running", function (done) {
            let running = (<any> BSTProcess).isRunning(process.pid);
            assert(running);
            done();
        });

        it("Tests REAL process is not running", function (done) {
            // 100000 should be safe
            //  By convention, not greater than 32768
            //  http://unix.stackexchange.com/questions/16883/what-is-the-maximum-value-of-the-pid-of-a-process
            let running = (<any> BSTProcess).isRunning(100000);
            assert(!running);
            done();
        });

    });

    describe("#kill()", function() {
        let sandbox: SinonSandbox = null;
        beforeEach(function (done) {
            exec("rm -rf " + (<any> BSTConfig).configDirectory(), function () {
                done();
            });

            sandbox = sinon.sandbox.create();
        });

        afterEach(function () {
            sandbox.restore();
        });

        it("Test new process written", async function (done) {
            this.timeout(5000);
            await Global.loadConfig();

            let runningPid: number = null;
            let proxy = new BSTProxy(ProxyType.LAMBDA).lambdaPort(10000);

            sandbox.stub(process, "kill", function(pid: number, code: any) {
                // Have to make sure to do the right thing when code is 0
                //  Otherwise, the initial check on whether the process is running does not work correctly
                //  FYI, calling kill with code 0 is what checks if a process is running
                if (code === 0) {
                    return true;
                }
                assert.equal(pid, runningPid);
                assert.equal(code, "SIGKILL");
                proxy.stop(function () {
                    done();
                });
            });


            proxy.start(async function () {
                await BSTConfig.load();
                let lambdaProcess = BSTProcess.running();
                runningPid = lambdaProcess.pid;
                lambdaProcess.kill();
            });
        });

    });
});