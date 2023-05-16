/*
 * This file provides a simple interface to interact with config.jsonc, whether that be reading to or writing from it
 */
import { readFileSync, readFile, writeFile } from "node:fs";
import { parse as parseJSONC, modify, applyEdits, JSONPath, Segment } from "jsonc-parser";
import { EventCategory, eventLogger } from "./logger.js";

/**
 * Path of the config on the filesystem relative to where node is being run from
 */
const CONFIG_LOCATION = "./config.jsonc";

/**
 * This is an object mirror of `config.jsonc`. You can load the config from the filesystem with `readConfigFromFileSystem()`.
 *
 */
// The any type is needed because the json is written to this object at runtime
export let botConfig: any = {
    /**
     * This function populates `botConfig` with a mirror of `config.jsonc`
     */
    readConfigFromFileSystem() {
        // read the config from the filesystem
        // TODO: only do this if the config hasn't been set already
        try {
            Object.assign(botConfig, parseJSONC(readFileSync(CONFIG_LOCATION, "utf-8")));
        } catch (err) {
            throw new Error("Unable to locate or process config.jsonc, are you sure it exists?");
        }
    },

    // https://stackoverflow.com/questions/18936915/dynamically-set-property-of-nested-object
    // used to modify a part of the config in memory
    _set(path: JSONPath, value: any) {
        let schema = this; // a moving reference to internal objects within obj
        for (let i = 0; i < path.length - 1; i++) {
            const elem = path[i];
            schema = schema[elem];
        }
        schema[path[path.length - 1]] = value;
    },

    /**
     * Selectively modify a part of the config. This reads the config from the filesystem and then modifies it, writing it back.
     *
     * It then applies the changes to the config in memory. This segmentation allows modification of the config on the fly, without
     * writing those changes to the filesystem.
     *
     * Do not use this to fill out config options that you're too lazy to manually add to `config.default.jsonc`
     *
     * @param location The path to what you'd like to edit as an array, so `foo.bar.baz` becomes `["foo", "bar", "baz"]`
     *
     * @param newValue Whatever you want the new value of `location` to be
     *
     * @example
     * // editing `botconfig.authToken` to "?win"
     * // if you check CONFIG_LOCATION, that file will have changed
     * botConfig.editConfigOption(["authToken"], "?win");
     *
     * @throws Will throw an error if `CONFIG_LOCATION` does not point to a valid file,
     * or filesystem operations fail in any way (bad perms, whatever). Will return silently and
     * log an error if `location` does not point to a valid location in the config.
     */
    async editConfigOption(location: JSONPath, newValue: any) {
        // iteratively determine whether or not the key that's being edited exists
        let currentPosition = this;
        for (let i in location) {
            // see if the key exists
            if (location[i] in currentPosition) {
                currentPosition = currentPosition[location[i]];
            } else {
                eventLogger.logEvent(
                    {
                        category: EventCategory.Error,
                        location: "core",
                        description: "An attempt was made to edit a config value that doesn't exist, cancelling edit",
                    },
                    1
                );
                return;
            }
        }

        this._set(location, newValue);

        // write changes to filesystem
        await readFile(CONFIG_LOCATION, "utf8", async (err, file) => {
            if (err) {
                throw err;
            }
            const newConfig = applyEdits(
                file,
                modify(file, location, newValue, { formattingOptions: { insertSpaces: true, tabSize: 4 } })
            );

            await writeFile(CONFIG_LOCATION, newConfig, () => {
                eventLogger.logEvent(
                    {
                        category: EventCategory.Info,
                        location: "any",
                        description: "`config.jsonc` changed and diff applied in memory",
                    },
                    2
                );
            });
        });
    },
};
