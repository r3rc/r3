import * as colors from "@std/fmt/colors";
import { toSnakeCase } from "@std/text";
import { formatLineColumns, resolveValue, toArray } from "./_utils.ts";
import { resolveArgs } from "./args.ts";
import type { Arg, ArgsDef, CommandDef } from "./types.ts";

export async function showUsage<T extends ArgsDef = ArgsDef>(cmd: CommandDef<T>, parent?: CommandDef<T>) {
    try {
        console.log((await renderUsage(cmd, parent)) + "\n");
    } catch (error) {
        console.error(error);
    }
}

const negativePrefixRe = /^no[-A-Z]/;

export async function renderUsage<T extends ArgsDef = ArgsDef>(cmd: CommandDef<T>, parent?: CommandDef<T>) {
    const cmdMeta = await resolveValue(cmd.meta ?? {});
    const cmdArgs = resolveArgs(await resolveValue(cmd.args ?? ({} as T)));
    const parentMeta = await resolveValue(parent?.meta ?? {});

    const scriptName = _getScriptName();
    const commandName = `${parentMeta.name ? `${parentMeta.name} ` : ""}${cmdMeta.name ?? scriptName}`;

    const argLines: string[][] = [];
    const posLines: string[][] = [];
    const commandsLines: string[][] = [];
    const usageLine: string[] = [];

    for (const arg of cmdArgs) {
        if (arg.type === "positional") {
            const name = arg.name.toUpperCase();
            const isRequired = arg.required !== false && arg.default === undefined;
            posLines.push([colors.cyan(name + _renderValueHint(arg)), _renderDescription(arg, isRequired)]);
            usageLine.push(isRequired ? `<${name}>` : `[${name}]`);
        } else {
            const isRequired = arg.required === true && arg.default === undefined;
            const argStr = [...(arg.alias ?? []).map((a) => `-${a}`), `--${arg.name}`].join(", ") +
                _renderValueHint(arg);
            argLines.push([colors.cyan(argStr), _renderDescription(arg, isRequired)]);

            if (
                arg.type === "boolean" &&
                (arg.default === true || (arg as { negativeDescription?: string }).negativeDescription) &&
                !negativePrefixRe.test(arg.name)
            ) {
                const negStr = [...(arg.alias ?? []).map((a) => `--no-${a}`), `--no-${arg.name}`].join(", ");
                const negDesc = (arg as { negativeDescription?: string }).negativeDescription;
                argLines.push([
                    colors.cyan(negStr),
                    [negDesc, isRequired ? colors.gray("(Required)") : ""].filter(Boolean).join(" ")
                ]);
            }

            if (isRequired) usageLine.push(`--${arg.name}` + _renderValueHint(arg));
        }
    }

    if (cmd.subCommands) {
        const commandNames: string[] = [];
        const subCommands = await resolveValue(cmd.subCommands);
        for (const [name, sub] of Object.entries(subCommands)) {
            const subCmd = await resolveValue(sub);
            const meta = await resolveValue(subCmd?.meta);
            if (meta?.hidden) continue;
            const aliases = toArray(meta?.alias);
            const label = [name, ...aliases].join(", ");
            commandsLines.push([colors.cyan(label), meta?.description ?? ""]);
            commandNames.push(name, ...aliases);
        }
        usageLine.push(commandNames.join("|"));
    }

    const version = cmdMeta.version ?? parentMeta.version;
    const usageLines: string[] = [
        colors.gray(`${cmdMeta.description} (${commandName}${version ? ` v${version}` : ""})`),
        "",
        `${colors.underline(colors.bold("USAGE"))} ${
            colors.cyan(
                `${commandName}${argLines.length > 0 || posLines.length > 0 ? " [OPTIONS]" : ""} ${usageLine.join(" ")}`
            )
        }`,
        ""
    ];

    if (posLines.length > 0) {
        usageLines.push(colors.underline(colors.bold("ARGUMENTS")), "", formatLineColumns(posLines, "  "), "");
    }

    if (argLines.length > 0) {
        usageLines.push(colors.underline(colors.bold("OPTIONS")), "", formatLineColumns(argLines, "  "), "");
    }

    if (commandsLines.length > 0) {
        usageLines.push(
            colors.underline(colors.bold("COMMANDS")),
            "",
            formatLineColumns(commandsLines, "  "),
            "",
            `Use ${colors.cyan(`${commandName} <command> --help`)} for more information about a command.`
        );
    }

    return usageLines.join("\n");
}

function _getScriptName(): string {
    try {
        return new URL(Deno.mainModule).pathname.split("/").pop() ?? "cli";
    } catch {
        return "cli";
    }
}

function _renderValueHint(arg: Arg): string {
    const hint = arg.valueHint ? `=<${arg.valueHint}>` : "";
    if (!arg.type || arg.type === "positional" || arg.type === "boolean") return hint;
    if (arg.type === "enum" && (arg as { options?: string[] }).options?.length) {
        return `=<${(arg as { options: string[] }).options.join("|")}>`;
    }
    return hint || `=<${toSnakeCase(arg.name)}>`;
}

function _renderDescription(arg: Arg, required: boolean): string {
    const reqHint = required ? colors.gray("(Required)") : "";
    const defHint = arg.default === undefined ? "" : colors.gray(`(Default: ${arg.default})`);
    return [arg.description, reqHint, defHint].filter(Boolean).join(" ");
}
