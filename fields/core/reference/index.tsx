import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const schema = (field: Field) => {
  let zodSchema: z.ZodTypeAny = z.coerce.string();

  if (field.options?.multiple) {
    zodSchema = z.array(zodSchema);
    
    if (field.required) {
      zodSchema = zodSchema.min(1, "This field is required");
    }
    
    zodSchema = z.preprocess(
      (val) => {
        if (val === "" || val === null || val === undefined) return [];
        // Ensure array values are converted to strings
        return Array.isArray(val) ? val.map(String) : val;
      },
      zodSchema
    );
  } else {
    if (!field.required) {
      zodSchema = zodSchema.optional();
    }
  }
  
  return zodSchema;
};

const label = "Reference";

export { label, schema, EditComponent };