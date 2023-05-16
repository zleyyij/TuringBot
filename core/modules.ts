import { EventCategory, eventLogger } from "./logger.js";
import { botConfig } from "./config.js";
import { APIEmbed } from "discord.js";

/**
 * This allows extension of the bot's initial functionality. Almost all discord facing functionality should be implemented as a module
 */
export class Module {
    /**
     * The case insensitive name you want to use to trigger the command. If the command was `foo`, you could type the configured prefix, followed by foo
     */
    readonly command: string;
    /**
     * Any alternative phrases you want to trigger the command. If the command was `foobarbuzz` you could maybe use `fbb` or `f`
     */
    readonly aliases: string[] = [];
    /**
     * This message will be displayed when the `help` utility is called, and when a command that has subcommands is referenced
     */
    readonly helpMessage: string;

    /**
     * Call this whenever you want to act on a command use
     */
    executeCommand: (args: string | void) => {} = async () => {};

    /**
     * If there are no submodules defined, this allows you to define what will be called whenever the command is used. It can either return nothing,
     * or an embed that will be used to respond to the user. You don't need to make use of the response embed, it's there as a
     * quality of life feature. If submodules are defined, a help message will be returned with help strings and usages for each
     * subcommand
     */
    onCommandExecute(functionToCall: (args: string | void) => Promise<void | APIEmbed>) {
        this.executeCommand = functionToCall;
    }

    /**
     * Whether or not the `initialize()` call was completed. If your initialization function never returns, you need to manually
     * set this to true if you want your command to be accessible. It should automatically be set to true by the core if you don't
     * manually set it and your initialization function completes without error.
     */

    /**
     * T
     */
    initialize: () => Promise<void> = async () => {};

    /**
     * Set a function to call when first loading the module. If you want to have a module with daemon functionality, this would be one way to implement it
     */
    onInitialize(functionToInitializeWith: () => Promise<void>) {
        this.initialize = functionToInitializeWith;
    }
    /**
     * Subcommands are referenced by typing the base command, then the subcommand. If a command has subcommands, then onCall should not be defined.
     */
    submodules: Module[] = [];

    /**
     * Whether or not the command should be accessible. This is false by default, and will either automatically be set once a valid config is located (if root module)
     */
    enabled: boolean = false;

    /**
     * The config for the *root extension* specified in config.jsonc. The root extension is the first command in the chain,
     * where if you wanted to call `foo bar baz`, the root would be `foo`. This is set in the constructor automatically by specifying `rootModuleName`
     */
    readonly config: NonNullable<any>;

    /**
     * Whatever the top level module for this module is named. If this is not a submodule, this value should be the same as `this.command`.
     *
     * If this is a submodule, it's `this.command`'s value for the default export module
     */
    rootModuleName: string;

    /**
     *
     * @param command The key phrase that references this module. There must be an extension config key matching this, or the module will be disabled.
     * @param helpMessage This message will be referenced when building help embeds, and is displayed to the user.
     * @param onCommandExecute
     * @param rootModuleName
     */
    constructor(
        command: string,
        helpMessage: string,
        onCommandExecute?: (args: string) => Promise<void | APIEmbed>,
        rootModuleName?: string
    ) {
        this.command = command;
        this.helpMessage = helpMessage;
        // if root module was not defined, assume a root module is being created and set it to `this.command`.
        if (rootModuleName) {
            this.rootModuleName = rootModuleName;
        } else {
            this.rootModuleName = this.command;
        }
        // now that the correct location for the config has been verified, we can fetch that config. If it doesn't exist,
        // the module will be disabled by default, and a warning emitted.
        if (this.rootModuleName in botConfig.modules) {
            this.config = botConfig.modules[this.rootModuleName];
            this.enabled = this.config.enabled;
        } else {
            eventLogger.logEvent(
                {
                    category: EventCategory.Warning,
                    location: "core",
                    description:
                        `No config found for "${this.rootModuleName}", ` +
                        `all modules and submodules for ${this.rootModuleName} will be disabled.`,
                },
                1
            );
            this.enabled = false;
        }

        eventLogger.logEvent({ category: EventCategory.Info, location: "core", description: `New module registered: ${command}` }, 3);
    }

    /**
     * Add a submodule to the current module
     * @param submoduleToRegister Submodule you'd like to add to the current Module or Submodule
     */
    registerSubmodule(submoduleToRegister: Module) {
        this.submodules.push(submoduleToRegister);
    }
}
