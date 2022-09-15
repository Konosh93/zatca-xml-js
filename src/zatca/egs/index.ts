/**
 * This module requires OpenSSL to be installed on the system. 
 * Using an OpenSSL In order to generate secp256k1 key pairs, a CSR and sign it.
 * I was unable to find a working library that supports the named curve `secp256k1` and do not want to implement my own JS based crypto.
 * Any crypto expert contributions to move away from OpenSSL to JS will be appreciated.
 */

import { spawn } from "child_process";
import { v4 as uuidv4 } from 'uuid';
import fs from "fs";

import defaultCSRConfig from "../templates/csr_template";

export interface EGSUnitLocation {
    city: string,
    city_subdivision: string,
    street: string,
    plot_identification: string,
    building: string,
    postal_zone: string
}

export interface EGSUnitInfo {
    uuid: string,
    CRN_number: string,
    VAT_name: string,
    VAT_number: string,
    location: EGSUnitLocation,

    private_key?: string,
    csr?: string,
    certificate?: string
}

const OpenSSL = (cmd: string[]): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        try {
            const command = spawn("openssl", cmd);
            let result = "";
            command.stdout.on("data", (data) => {
                 result += data.toString();
            });
            command.on("close", (code: number) => {
                return resolve(result);
            });
            command.on("error", (error: any) => {
                return reject(error);
            });
        } catch (error: any) {
            reject(error);
        }
    });
}

// Generate a secp256k1 key pair
// https://techdocs.akamai.com/iot-token-access-control/docs/generate-ecdsa-keys
// openssl ecparam -name secp256k1 -genkey -noout -out ec-secp256k1-priv-key.pem
const generateSecp256k1KeyPair = async (): Promise<string> => {
    try {
        const result = await OpenSSL(["ecparam", "-name", "secp256k1", "-genkey"]);
        if (!result.includes("-----BEGIN EC PRIVATE KEY-----")) throw ("Error no private key found in OpenSSL output.");

        let private_key: string = `-----BEGIN EC PRIVATE KEY-----${result.split("-----BEGIN EC PRIVATE KEY-----")[1]}`.trim();
        return private_key;
    } catch (error) {
        throw error;
    }
}

// Generate a signed ecdsaWithSHA256 CSR
// 2.2.2 Profile specification of the Cryptographic Stamp identifiers. & CSR field contents / RDNs.
const generateCSR = async (private_key: string): Promise<string> => {
    // This creates a temporary private file, and csr config file to pass to OpenSSL in order to create and sign the CSR.
    // * In terms of security, this is very bad as /tmp can be accessed by all users. a simple watcher by unauthorized user can retrieve the keys.
    // Better change it to some protected dir.
    const private_key_file = `/tmp/${uuidv4()}.pem`;
    const csr_config_file = `/tmp/${uuidv4()}.cnf`;
    fs.writeFileSync(private_key_file, private_key);
    fs.writeFileSync(csr_config_file, defaultCSRConfig(
        // TODO
    ));
    
    const cleanUp = () => {
        fs.unlink(private_key_file, ()=>{});
        fs.unlink(csr_config_file, ()=>{});
    };
    
    try {    
        const result = await OpenSSL(["req", "-new", "-sha256", "-key", private_key_file, "-config", csr_config_file]);
        if (!result.includes("-----BEGIN CERTIFICATE REQUEST-----")) throw ("Error no CSR found in OpenSSL output.");

        let csr: string = `-----BEGIN CERTIFICATE REQUEST-----${result.split("-----BEGIN CERTIFICATE REQUEST-----")[1]}`.trim();
        cleanUp();
        return csr;
    } catch (error) {
        cleanUp();
        throw error;
    }
}




class EGS {

    private egs_info: EGSUnitInfo;
    constructor(egs_info: EGSUnitInfo) {
        this.egs_info = egs_info;
    }


    get() {
        return this.egs_info;
    }

    /**
     * Generates a new secp256k1 Public/Private key pair for the EGS.
     * Also generates and signs a new CSR.
     * @returns void on success, throws error on fail.
     */
    async generateNewKeysAndCSR(): Promise<any> {
        try {
            const new_private_key = await generateSecp256k1KeyPair();
            const new_csr = await generateCSR(new_private_key);
    
            this.egs_info.private_key = new_private_key;
            this.egs_info.csr = new_csr;

            return;
        } catch (error) {
            throw error;
        }
    }



}

export default EGS;