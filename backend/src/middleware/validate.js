export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const first = Object.entries(errors)[0];
      return res.status(400).json({
        error: first ? `${first[0]}: ${first[1][0]}` : 'Validation failed',
        details: errors,
      });
    }
    req.parsedBody = result.data;
    next();
  };
}
