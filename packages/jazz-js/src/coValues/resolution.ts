import { Schema, AST } from "@effect/schema";
import { RawCoValue } from "cojson";
import { CoValue, CoValueSchema } from "../coValueInterfaces.js";

// TODO: can we get rid of this because effect schema already has an annotation for the constructor?
export const constructorOfSchemaSym = Symbol.for("@jazz/constructorOfSymbol");
export type constructorOfSchemaSym = typeof constructorOfSchemaSym;

export function propertyIsCoValueSchema(
    prop:
        | Schema.Schema<any>
        | Schema.PropertySignature<any, boolean, any, boolean, never>
): prop is CoValueSchema {
    if ("propertySignatureAST" in prop) {
        return astIsCoValueSchema(
            (prop.propertySignatureAST as { from: AST.AST }).from
        );
    } else {
        return astIsCoValueSchema((prop as Schema.Schema<unknown>).ast);
    }
}

function astIsCoValueSchema(ast: AST.AST): boolean {
    if (
        (ast._tag === "Declaration") &&
        ast.annotations[constructorOfSchemaSym]
    ) {
        return true;
    } else if (ast._tag === "Union") {
        return ast.types.every(
            (member) =>
                member._tag === "UndefinedKeyword" || astIsCoValueSchema(member)
        );
    } else if (
        ast._tag === "BooleanKeyword" ||
        ast._tag === "NumberKeyword" ||
        ast._tag === "StringKeyword" ||
        ast._tag === "Literal" ||
        ast._tag === "Tuple"
    ) {
        return false;
    } else if (ast._tag === "Refinement") {
        return astIsCoValueSchema(ast.from);
    } else if (ast._tag === "Transform") {
        return astIsCoValueSchema(ast.from);
    } else {
        throw new Error(
            `astIsCoValueSchema can't yet handle ${ast._tag}: ${JSON.stringify(
                ast
            )}`
        );
    }
}

export function getCoValueConstructorInProperty(
    prop:
        | Schema.Schema<unknown>
        | Schema.PropertySignature<unknown, boolean, unknown, boolean, never>,
    rawValue: RawCoValue
):
    | (new (init: undefined, options: { fromRaw: RawCoValue }) => CoValue)
    | undefined {
    if ("propertySignatureAST" in prop) {
        return getCoValueConstructorInAST(
            (prop.propertySignatureAST as { from: AST.AST }).from,
            rawValue
        );
    } else {
        return getCoValueConstructorInAST(
            (prop as Schema.Schema<unknown>).ast,
            rawValue
        );
    }
}

// TODO (optimization): make this meta, so this creates a tailor-made function that will take a RawCoValue at call time
function getCoValueConstructorInAST(
    ast: AST.AST,
    rawValue: RawCoValue
):
    | (new (init: undefined, options: { fromRaw: RawCoValue }) => CoValue)
    | undefined {
    if (
        (ast._tag === "Declaration") &&
        ast.annotations[constructorOfSchemaSym]
    ) {
        return ast.annotations[constructorOfSchemaSym] as new (
            init: undefined,
            options: { fromRaw: RawCoValue }
        ) => CoValue;
    } else if (ast._tag === "Union" && ast.types.length === 2) {
        const [a, b] = ast.types;
        if (a._tag === "UndefinedKeyword") {
            return getCoValueConstructorInAST(b, rawValue);
        } else if (b._tag === "UndefinedKeyword") {
            return getCoValueConstructorInAST(a, rawValue);
        } else {
            throw new Error(
                `getCoValueConstructorInAST can't yet handle Union of: ${JSON.stringify(
                    ast.types
                )}`
            );
        }
    } else {
        throw new Error(
            `getCoValueConstructorInAST can't yet handle ${
                ast._tag
            }: ${JSON.stringify(ast)}`
        );
    }
}
